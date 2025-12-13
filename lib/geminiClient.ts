// lib/geminiClient.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY manquant dans les variables d'environnement");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * modèle texte rapide de Gemini pour parsing de commande
 * tu peux changer le nom du modèle plus tard si besoin
 */
export const geminiOrderModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash", // modèle texte équilibré
});
