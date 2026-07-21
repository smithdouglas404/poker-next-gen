import { callNakamaRpc } from "@/lib/nakama/rpc";

type RouteContext = { params: Promise<{ id: string }> };

// Serves a durably re-hosted generated character GLB. The bytes live in Postgres
// (re-hosted from Tripo at mint time) and are fetched via the model_asset RPC;
// we stream them with an immutable cache so useGLTF loads each model once.
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const data = (await callNakamaRpc("model_asset", { cosmetic_id: id })) as {
      content_type?: string;
      data_base64?: string;
    };
    if (!data?.data_base64) {
      return new Response("not found", { status: 404 });
    }
    const bytes = Buffer.from(data.data_base64, "base64");
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": data.content_type || "model/gltf-binary",
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("error", { status: 502 });
  }
}
