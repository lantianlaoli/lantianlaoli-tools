# search
const url = new URL(
    "https://api.steadyapi.com/v1/reddit/search"
);

const params = {
    "search": "investing",
    "subreddit": "wallstreetbets",
    "filter": "posts",
    "timeFilter": "all",
    "sortType": "relevance",
};
Object.keys(params)
    .forEach(key => url.searchParams.append(key, params[key]));

const headers = {
    "Authorization": "Bearer {YOUR_AUTH_KEY}",
    "Accept": "application/json",
};

fetch(url, {
    method: "GET",
    headers,
}).then(response => response.json());

#post
const url = new URL(
    "https://api.steadyapi.com/v1/reddit/post"
);

const params = {
    "url": "https://www.reddit.com/r/wallstreetbets/comments/p0esdp/do_hedge_funds_beat_the_market_i_analyzed_the",
};
Object.keys(params)
    .forEach(key => url.searchParams.append(key, params[key]));

const headers = {
    "Authorization": "Bearer {YOUR_AUTH_KEY}",
    "Accept": "application/json",
};

fetch(url, {
    method: "GET",
    headers,
}).then(response => response.json());

# popular
const url = new URL(
    "https://api.steadyapi.com/v1/reddit/subreddit/popular"
);

const headers = {
    "Authorization": "Bearer {YOUR_AUTH_KEY}",
    "Accept": "application/json",
};

fetch(url, {
    method: "GET",
    headers,
}).then(response => response.json());

#new
const url = new URL(
    "https://api.steadyapi.com/v1/reddit/subreddit/new"
);

const headers = {
    "Authorization": "Bearer {YOUR_AUTH_KEY}",
    "Accept": "application/json",
};

fetch(url, {
    method: "GET",
    headers,
}).then(response => response.json());

#comments
const url = new URL(
    "https://api.steadyapi.com/v1/reddit/subreddit/comments"
);

const params = {
    "subreddit": "wallstreetbets",
};
Object.keys(params)
    .forEach(key => url.searchParams.append(key, params[key]));

const headers = {
    "Authorization": "Bearer {YOUR_AUTH_KEY}",
    "Accept": "application/json",
};

fetch(url, {
    method: "GET",
    headers,
}).then(response => response.json());