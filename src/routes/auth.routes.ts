import { Router } from "express";
import { signUpController } from "../controllers/auth/singUpController";
import { loginController } from "../controllers/auth/loginController";
import { requireAuth } from "../controllers/requireAuth/requireAuth";

export const authRoutes = Router();

authRoutes.post("/signup", signUpController);
authRoutes.post("/login", loginController);

authRoutes.get("/me", requireAuth, (req, res) => {
  return res.status(200).json({ userId: req.userId });
});