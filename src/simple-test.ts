
export default {
    async fetch(request, env, ctx) {
        return new Response(JSON.stringify({ status: "ok", message: "Minimal worker deployed" }), {
            headers: { "Content-Type": "application/json" }
        });
    }
};
