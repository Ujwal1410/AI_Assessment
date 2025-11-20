import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import fastApiClient from "../../../lib/fastapi";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  // Session validation - Note: This is for candidate routes, but we still validate session exists
  // The actual candidate verification happens in the backend with token
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ success: false, message: "Unauthorized. Please sign in." });
  }

  try {
    const response = await fastApiClient.post("/api/assessment/log-answer", req.body);
    return res.status(response.status || 200).json(response.data);
  } catch (error: any) {
    const statusCode = error?.response?.status || 500;
    const errorMessage =
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.message ||
      "Failed to log answer. Please try again.";
    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
    });
  }
}

