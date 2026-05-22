export const config = { runtime: "edge" };

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

export default async function handler(req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "GOOGLE_VISION_API_KEY chưa được cấu hình trên Vercel",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { images } = await req.json();
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: "Thiếu hình ảnh" }), {
        status: 400,
      });
    }

    // Build batched Vision API request - one request per image (page)
    const visionPayload = {
      requests: images.map((base64Img) => ({
        image: { content: base64Img },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["vi", "en"] },
      })),
    };

    const visionResp = await fetch(`${VISION_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visionPayload),
    });

    const visionData = await visionResp.json();

    if (visionData.error) {
      return new Response(
        JSON.stringify({ error: visionData.error.message || "Vision API lỗi" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Extract text from each page response
    const texts = (visionData.responses || []).map((r) => {
      if (r.error) return "";
      return r.fullTextAnnotation?.text || "";
    });

    return new Response(
      JSON.stringify({ text: texts.join("\n\n") }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
