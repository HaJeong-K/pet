const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export const ok = (body, statusCode = 200) => ({
  statusCode,
  headers: HEADERS,
  body: JSON.stringify(body),
});

export const fail = (message, statusCode = 400) => ({
  statusCode,
  headers: HEADERS,
  body: JSON.stringify({ error: message }),
});