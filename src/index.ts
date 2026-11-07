const API_HOST = "us.i.posthog.com"
const ASSET_HOST = "us-assets.i.posthog.com"

function addCorsHeaders(response: Response): Response {
	const newHeaders = new Headers(response.headers)
	newHeaders.set("Access-Control-Allow-Origin", "*")
	newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	newHeaders.set("Access-Control-Allow-Headers", "*")
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders
	})
}

async function handleRequest(request: Request, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url)
	const pathname = url.pathname
	const search = url.search
	const pathWithParams = pathname + search

	const response = (pathname.startsWith("/static/") || pathname.startsWith("/array/"))
		? await retrieveAsset(request, pathWithParams, ctx)
		: await forwardRequest(request, pathWithParams)
	return addCorsHeaders(response)
}

async function retrieveAsset(request: Request, pathname: string, ctx: ExecutionContext): Promise<Response> {
	let response = await caches.default.match(request)
	if (!response) {
		response = await fetch(`https://${ASSET_HOST}${pathname}`)
		ctx.waitUntil(caches.default.put(request, response.clone()))
	}
	return response
}

async function forwardRequest(request: Request, pathWithSearch: string): Promise<Response> {
	const ip = request.headers.get("CF-Connecting-IP") || ""
	const originHeaders = new Headers(request.headers)
	originHeaders.delete("cookie")
	// Forward PostHog keys (Bearer phc_, phs_ or phx_), which the SDKs need. Strip any other credentials.
	// To allow an older key without one of these prefixes, also match its exact 'Bearer <key>' value.
	if (!/^Bearer ph[csx]_/.test(originHeaders.get("authorization") ?? "")) {
		originHeaders.delete("authorization")
	}
	originHeaders.set("X-Forwarded-For", ip)

	const originRequest = new Request(`https://${API_HOST}${pathWithSearch}`, {
		method: request.method,
		headers: originHeaders,
		body: request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : null,
		redirect: request.redirect
	})

	return await fetch(originRequest)
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handleRequest(request, ctx);
	},
} satisfies ExportedHandler<Env>;
