import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type DocumentForEmbedding = {
  file_name: string;
  summary: string;
  objective_data: string;
  subjective_opinion: string;
  ai_opinion: string;
  tags: string[] | null;
};

function buildEmbeddingText(doc: DocumentForEmbedding): string {
  return [
    doc.file_name,
    doc.tags?.join(", ") || "",
    doc.summary,
    doc.objective_data,
    doc.subjective_opinion,
    doc.ai_opinion,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function embedDocument(doc: DocumentForEmbedding): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: buildEmbeddingText(doc),
  });
  return res.data[0].embedding;
}
