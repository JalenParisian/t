/**
 * Cloudflare Worker: Smart CPA Offer Microservice
 *
 * Functions:
 * 1. Acts as a secure middleware to hide API keys.
 * 2. Detects visitor IP and User-Agent automatically.
 * 3. Fetches the best offer from AdBlueMedia.
 * 4. Returns a clean, CORS-enabled JSON response.
 */

export default {
  async fetch(request, env, ctx) {
    // =========================================================================
    // 1. CORS Configuration (Crucial for Frontend Access)
    // =========================================================================
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle the OPTIONS preflight request immediately
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // =========================================================================
    // 2. Main Logic
    // =========================================================================
    try {
      // --- Visitor Detection ---
      // Cloudflare provides the real user IP in 'CF-Connecting-IP'
      const visitorIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1"; // Fallback for testing
      const visitorUa =
        request.headers.get("User-Agent") ||
        "Mozilla/5.0 (Compatible; Smart-CPA-Worker/1.0)";

      // --- Construct API URL ---
      // We use URLSearchParams to safely encode all parameters
      const feedUrl = new URL(
        "https://d1y3y09sav47f5.cloudfront.net/public/offers/feed.php",
      );

      feedUrl.searchParams.set("user_id", "611649");
      feedUrl.searchParams.set("api_key", "5b940f32e94b1f757dd335bb88ab840f");
      feedUrl.searchParams.set("s1", "worker_api"); // Tracking parameter
      feedUrl.searchParams.set("ip", visitorIp); // Pass real visitor IP
      feedUrl.searchParams.set("user_agent", visitorUa); // Pass real UA for OS/Device targeting

      // --- Fetch Offers ---
      const response = await fetch(feedUrl.toString(), {
        headers: {
          // It's often good practice to identify your bot/worker
          "User-Agent": "Cloudflare-Worker-CPA-Middleware/1.0",
        },
        cf: {
          // Optimization: Cache content slightly if needed, but for real-time GEO, we usually want fresh
          cacheTtl: 0,
        },
      });

      if (!response.ok) {
        throw new Error(`Upstream Network Error: ${response.status}`);
      }

      // --- Parse Response ---
      const data = await response.json();

      // Debugging (optional, removed for production cleanliness)
      // console.log(data);

      // --- Validate Offers ---
      // The API returns an array of offers. If empty, we have no offers for this geo/device.
      if (!Array.isArray(data) || data.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "No offers available for this user.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200, // Return 200 so frontend can handle it gracefully
          },
        );
      }

      // Select the "Best" offer (First one in the array is typically the highest performing/yield)
      const bestOffer = data[0];

      // --- Structure the Response ---
      // We map the raw API fields to the clean structure requested.
      // Mappings based on standard CPA keys:
      // anchor -> name, url -> link, conversion -> payout, requirements -> instructions
      const cleanResponse = {
        success: true,
        offer: {
          name: bestOffer.anchor || bestOffer.name || "Exclusive Offer",
          link: bestOffer.url || bestOffer.click_url || "#",
          payout: bestOffer.conversion || bestOffer.payout || "0.00",
          instructions:
            bestOffer.requirements ||
            bestOffer.description ||
            "Complete the steps to proceed.",
        },
      };

      return new Response(JSON.stringify(cleanResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      // --- Global Error Handling ---
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  },
};
