// services/aiService.js

export async function analyzePhotos(photoFiles) {
  // Use simulated data for testing (avoids CORS issues)
  // Remove this check when you have a backend proxy for Anthropic API
  if (!import.meta.env.VITE_ANTHROPIC_API_KEY || import.meta.env.VITE_ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    return simulateAIAnalysis(photoFiles.length);
  }

  const base64Images = await Promise.all(
    photoFiles.map(
      file =>
        new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(",")[1]);
          r.onerror = rej;
          r.readAsDataURL(file);
        })
    )
  );

  const content = [
    {
      type: "text",
      text: `
Return STRICT JSON ONLY:

{
  "overallCondition": "light" | "moderate" | "heavy",
  "rooms": {
    "kitchen": { "damageScore": 0-100, "condition": "light|moderate|heavy" },
    "bathroom": { "damageScore": 0-100, "condition": "light|moderate|heavy" },
    "livingArea": { "damageScore": 0-100, "condition": "light|moderate|heavy" },
    "floors": { "damageScore": 0-100, "condition": "light|moderate|heavy" }
  },
  "estimatedAddTime": 0-3,
  "confidence": 0-100,
  "recommendations": []
}
`
    },
    ...base64Images.map(data => ({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data
      }
    }))
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        messages: [{ role: "user", content }]
      })
    });

    const data = await res.json();
    const content2 = data.content[0].text;
    const jsonMatch = content2.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('AI API call failed, using simulated data:', error);
    return simulateAIAnalysis(photoFiles.length);
  }
}

// Simulated AI analysis for testing
function simulateAIAnalysis() {
  return {
    overallCondition: "moderate",
    rooms: {
      kitchen: { damageScore: 45, condition: "moderate" },
      bathroom: { damageScore: 60, condition: "moderate" },
      livingArea: { damageScore: 35, condition: "light" },
      floors: { damageScore: 50, condition: "moderate" }
    },
    estimatedAddTime: 1,
    confidence: 85,
    recommendations: [
      "Deep clean bathroom tiles",
      "Polish hardwood floors",
      "Clean kitchen appliances"
    ]
  };
}
