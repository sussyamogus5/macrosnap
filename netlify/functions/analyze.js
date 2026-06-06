exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { imageBase64, imageMimeType, weight, extra } = JSON.parse(event.body);

  const prompt = `You are a nutrition expert. Look at this food photo and estimate macros for a ${weight}g portion.${extra ? '\n\nExtra context: ' + extra : ''}

You MUST respond with ONLY a raw JSON object. No markdown. No backticks. No explanation. No text before or after. Just the JSON.
Example: {"food":"grilled chicken","calories":165,"protein_g":31,"carbs_g":0,"fat_g":3.6}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-nano-12b-v2-vl:free',
      max_tokens: 256,
      messages: [
        { role: 'system', content: 'You are a nutrition API. Always respond with only a raw JSON object, no markdown, no backticks, no explanation.' },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
          { type: 'text', text: prompt }
        ]}
      ]
    })
  });

  const data = await response.json();

  if (data.error) {
    return { statusCode: 500, body: JSON.stringify({ error: data.error.message }) };
  }

  const raw = data.choices[0].message.content;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse nutrition data, try again' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: jsonMatch[0]
  };
};
