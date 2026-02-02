import { Router } from "express";
import { signupController } from "../controllers/auth/singUpController";
import { loginController } from "../controllers/auth/loginController";
import { requireAuth } from "../controllers/requireAuth/requireAuth";
import { changePasswordController } from "../controllers/auth/changePasswordController";
import { refreshController } from "../controllers/auth/refreshController";

export const authRoutes = Router();

authRoutes.post("/signup", signupController);
authRoutes.post("/login", loginController);
authRoutes.put("/change-password", requireAuth, changePasswordController);
authRoutes.post("/refresh", refreshController);

authRoutes.get("/me", requireAuth, (req, res) => {
  return res.status(200).json({ userId: req.userId });
});