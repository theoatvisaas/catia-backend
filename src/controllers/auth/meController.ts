import { Response } from "express";
import { AuthedRequest } from "../requireAuth/requireAuth";

export async function meController(req: AuthedRequest, res: Response) {
  return res.status(200).json({
    userId: req.userId,
    email: req.userEmail,
  });
}
