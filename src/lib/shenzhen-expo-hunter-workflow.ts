import type {
  ShenzhenExpoHunterJob,
  ExpoHunterExpoResult,
  ShenzhenExpoHunterSearchSettings,
  ExpoHunterLead,
  ExpoHunterIndustryIntel,
  ExpoHunterComment,
  ExpoHunterExpo,
  ExpoHunterSubreddit,
} from "./types";
import {
  parseExpoSchedule,
  parseExpoScheduleFromImage,
  generateSearchQueries,
  classifyComment,
  classifyPost,
  deduplicateLeads,
  deduplicateSubreddits,
  deduplicateIntel,
  deduplicateComments,
  groupDiscussionsBySubreddit,
  isRecentRedditDiscussion,
  mergeSearchSettings,
} from "./shenzhen-expo-hunter";
import { searchPosts, searchComments } from "./steady-reddit";
import { addJob, getJob, updateJob, generateJobId } from "./shenzhen-expo-hunter-store";

const now = () => Date.now();
const MAX_REDDIT_SEARCH_QUERIES = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProviderQuotaError(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes("request failed: 429") || message.includes("quota") || message.includes("Too many requests");
}

export async function createExpoHunterJob(input: {
  rawSchedule?: string;
  imageDataUrl?: string;
  settings?: Partial<ShenzhenExpoHunterSearchSettings>;
}): Promise<ShenzhenExpoHunterJob> {
  const settings = mergeSearchSettings(input.settings);

  let expos: ExpoHunterExpo[];

  if (input.imageDataUrl) {
    expos = await parseExpoScheduleFromImage(input.imageDataUrl);
    if (expos.length === 0) {
      throw new Error("Could not extract any expos from the image. Try pasting the schedule as text instead.");
    }
  } else if (input.rawSchedule) {
    expos = parseExpoSchedule(input.rawSchedule);
    if (expos.length === 0) {
      throw new Error("Could not parse any expos from the schedule. Paste a table or multi-line list with expo names.");
    }
  } else {
    throw new Error("Please provide an expo schedule image or paste the schedule text.");
  }

  const scheduleText = input.rawSchedule ?? "(uploaded image)";

  const results: ExpoHunterExpoResult[] = expos.map((expo) => ({
    expo,
    status: "waiting" as const,
    subreddits: [],
    leads: [],
    photos: [],
    industryIntel: [],
    comments: [],
    discussionsBySubreddit: [],
  }));

  const job: ShenzhenExpoHunterJob = {
    id: generateJobId(),
    status: "parsed",
    rawSchedule: scheduleText,
    settings,
    expos,
    results,
    createdAt: now(),
    updatedAt: now(),
  };

  addJob(job);
  return job;
}

export async function processExpoHunterJob(jobId: string): Promise<ShenzhenExpoHunterJob> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");

  const updated = updateJob(jobId, (j) => ({
    ...j,
    status: "processing" as const,
    updatedAt: now(),
    results: j.results.map((r) =>
      r.status === "waiting" ? { ...r, status: "processing" as const } : r,
    ),
  }))!;

  for (let i = 0; i < updated.results.length; i++) {
    const result = updated.results[i];
    if (result.status !== "processing") continue;

    try {
      const processed = await processExpoSlot(result, updated.settings);
      updateJob(jobId, (j) => {
        const newResults = [...j.results];
        newResults[i] = { ...processed, status: "success" as const };
        return { ...j, results: newResults, updatedAt: now() };
      });
    } catch (error) {
      updateJob(jobId, (j) => {
        const newResults = [...j.results];
        newResults[i] = {
          ...newResults[i],
          status: "fail" as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return { ...j, results: newResults, updatedAt: now() };
      });
    }
  }

  return updateJob(jobId, (j) => {
    const allFailed = j.results.every((r) => r.status === "fail");
    const allDone = j.results.every((r) => r.status === "success" || r.status === "fail");
    return {
      ...j,
      status: allFailed ? "failed" : allDone ? "completed" : j.status,
      updatedAt: now(),
    };
  })!;
}

export async function runExpoHunterExpo(
  jobId: string,
  expoId: string,
  settings?: Partial<ShenzhenExpoHunterSearchSettings>,
): Promise<ShenzhenExpoHunterJob> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");

  const idx = job.results.findIndex((r) => r.expo.id === expoId);
  if (idx === -1) throw new Error("Expo not found in job results");

  const mergedSettings = mergeSearchSettings({
    ...job.settings,
    ...(settings ?? {}),
  });

  updateJob(jobId, (j) => {
    const newResults = [...j.results];
    newResults[idx] = {
      ...newResults[idx],
      status: "processing" as const,
      error: undefined,
      subreddits: [],
      leads: [],
      photos: [],
      industryIntel: [],
      comments: [],
      discussionsBySubreddit: [],
    };
    return {
      ...j,
      status: "processing" as const,
      settings: mergedSettings,
      results: newResults,
      updatedAt: now(),
    };
  });

  const jobAfter = getJob(jobId)!;
  const slot = jobAfter.results[idx];

  try {
    const processed = await processExpoSlot(slot, mergedSettings);
    return updateJob(jobId, (j) => {
      const newResults = [...j.results];
      newResults[idx] = { ...processed, status: "success" as const };
      const anyProcessing = newResults.some((r) => r.status === "processing");
      const allAttempted = newResults.every((r) => r.status === "success" || r.status === "fail");
      return {
        ...j,
        results: newResults,
        status: allAttempted ? "completed" : anyProcessing ? "processing" : "parsed",
        updatedAt: now(),
      };
    })!;
  } catch (error) {
    return updateJob(jobId, (j) => {
      const newResults = [...j.results];
      newResults[idx] = {
        ...newResults[idx],
        status: "fail" as const,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      const anyProcessing = newResults.some((r) => r.status === "processing");
      const allAttempted = newResults.every((r) => r.status === "success" || r.status === "fail");
      return {
        ...j,
        results: newResults,
        status: allAttempted ? (newResults.every((r) => r.status === "fail") ? "failed" : "completed") : anyProcessing ? "processing" : "parsed",
        updatedAt: now(),
      };
    })!;
  }
}

async function processExpoSlot(
  result: ExpoHunterExpoResult,
  settings: ShenzhenExpoHunterSearchSettings,
): Promise<ExpoHunterExpoResult> {
  const queries = generateSearchQueries(result.expo, settings.depth);

  const allSubreddits: ExpoHunterSubreddit[] = [];
  const allLeads: ReturnType<typeof classifyPost>[] = [];
  const allComments: ExpoHunterComment[] = [];

  const searchQueries = queries.slice(0, MAX_REDDIT_SEARCH_QUERIES);
  let successfulQueries = 0;
  const searchFailures: string[] = [];

  for (const query of searchQueries) {
    const [postResult, commentResult] = await Promise.allSettled([
      searchPosts(query),
      searchComments(query),
    ]);
    let queryHadSuccess = false;

    if (postResult.status === "fulfilled") {
      queryHadSuccess = true;
      const postResponse = postResult.value;
      if (postResponse?.data?.posts) {
        for (const item of postResponse.data.posts) {
          if (item.kind === "t3" && item.data) {
            const classified = classifyPost(item.data, result.expo.industryKeywords);
            allLeads.push(classified);
          }
        }
      }
    } else {
      searchFailures.push(`posts "${query}": ${errorMessage(postResult.reason)}`);
    }

    if (commentResult.status === "fulfilled") {
      const commentResponse = commentResult.value;
      if (commentResponse) {
        queryHadSuccess = true;
      }
      if (commentResponse?.data?.comments) {
        for (const item of commentResponse.data.comments) {
          if (item.kind === "t1" && item.data) {
            const classified = classifyComment(item.data, result.expo.industryKeywords);
            if (classified) {
              allComments.push(classified);
            }
          }
        }
      }
    } else {
      searchFailures.push(`comments "${query}": ${errorMessage(commentResult.reason)}`);
    }

    if (queryHadSuccess) {
      successfulQueries += 1;
    }

    const results = [postResult, commentResult];
    const allAttemptedHitQuota = results.every((searchResult) => (
      searchResult.status === "rejected" && isProviderQuotaError(searchResult.reason)
    ));
    if (allAttemptedHitQuota) break;
  }

  if (successfulQueries === 0 && searchQueries.length > 0) {
    throw new Error(
      `All Reddit searches failed for this expo. ${searchFailures.slice(-3).join(" | ")}`,
    );
  }

  if (searchFailures.length > 0) {
    console.warn(
      `[shenzhen-expo-hunter] Some Reddit searches failed for ${result.expo.name}: ${searchFailures.slice(0, 6).join(" | ")}`,
    );
  }

  const recentLeads = allLeads
    .filter((c) => c.type === "lead")
    .map((c) => c.lead as ExpoHunterLead)
    .filter((lead) => isRecentRedditDiscussion(lead.createdUtc));

  const recentIntel = allLeads
    .filter((c) => c.type === "intel")
    .map((c) => c.intel as ExpoHunterIndustryIntel)
    .filter((intel) => isRecentRedditDiscussion(intel.createdUtc));

  const leads = deduplicateLeads(recentLeads)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, settings.maxPosts);

  const industryIntel = deduplicateIntel(recentIntel)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, settings.maxPosts);

  const comments = deduplicateComments(
    allComments.filter((comment) => isRecentRedditDiscussion(comment.createdUtc)),
  )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, settings.maxPosts);

  const discussions = [...leads, ...industryIntel, ...comments]
    .sort((a, b) => b.createdUtc - a.createdUtc)
    .slice(0, settings.maxPosts);
  const discussionsBySubreddit = groupDiscussionsBySubreddit(discussions);
  const derivedSubreddits = discussionsBySubreddit.map((group, index) => ({
    name: group.subreddit,
    title: group.subreddit,
    description: `${group.discussions.length} matched discussion${group.discussions.length === 1 ? "" : "s"}`,
    subscribers: 0,
    relevanceScore: Math.max(0.1, 1 - index * 0.1),
  }));
  const subreddits = deduplicateSubreddits([...allSubreddits, ...derivedSubreddits])
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, settings.maxSubreddits);

  return {
    ...result,
    subreddits,
    leads,
    photos: [],
    industryIntel,
    comments,
    discussionsBySubreddit,
  };
}

export async function retryExpoHunterExpo(
  jobId: string,
  expoId: string,
): Promise<ShenzhenExpoHunterJob> {
  return runExpoHunterExpo(jobId, expoId);
}

export function exportExpoHunterJob(
  job: ShenzhenExpoHunterJob,
  format: "markdown" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(job, null, 2);
  }

  const lines: string[] = [];
  lines.push("# Shenzhen Expo Hunter Report\n");
  lines.push(`**Generated:** ${new Date().toISOString()}\n`);

  for (const result of job.results) {
    const { expo } = result;
    const discussionGroups =
      result.discussionsBySubreddit ??
      groupDiscussionsBySubreddit([
        ...(result.leads ?? []),
        ...(result.industryIntel ?? []),
        ...(result.comments ?? []),
      ]);
    lines.push(`## ${expo.name}\n`);
    if (expo.date) lines.push(`- **Date:** ${expo.date}`);
    if (expo.location) lines.push(`- **Location:** ${expo.location}`);
    lines.push(`- **Keywords:** ${expo.industryKeywords.join(", ")}`);
    lines.push(`- **Status:** ${result.status}\n`);

    if (result.error) {
      lines.push(`> Error: ${result.error}\n`);
    }

    if (discussionGroups.length > 0) {
      lines.push("### Recent Reddit Discussions by Subreddit\n");
      for (const group of discussionGroups) {
        lines.push(`#### ${group.subreddit}\n`);
        for (const discussion of group.discussions) {
          lines.push(`- **[${discussion.title}](${discussion.permalink})**`);
          lines.push(
            `  - Source: ${discussion.sourceType === "comment" ? "comment" : "post"} | Author: u/${discussion.author} | Score: ${discussion.score} | Comments: ${discussion.numComments}`,
          );
          lines.push(`  - Confidence: ${(discussion.confidence * 100).toFixed(0)}% | Keywords: ${discussion.matchedKeywords.join(", ")}`);
          if (discussion.selftext) {
            lines.push(`  - ${discussion.selftext.slice(0, 220)}${discussion.selftext.length > 220 ? "..." : ""}`);
          }
        }
        lines.push("");
      }
      lines.push("");
    }

    if (
      discussionGroups.length === 0 &&
      result.status === "success"
    ) {
      lines.push("_No relevant Reddit discussions from the last 6 months found for this expo._\n");
    }

    lines.push("---\n");
  }

  return lines.join("\n");
}
