// instrumentation disabled for vercel serverless
// preloading doesn't work well with cold starts and isolated function instances
// all initialization happens lazily when needed

export async function register() {
  // intentionally empty - serverless functions handle their own initialization
}
