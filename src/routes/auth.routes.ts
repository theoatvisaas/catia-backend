import { Router } from "express";
import { signupController } from "../controllers/auth/singUpController";
import { loginController } from "../controllers/auth/loginController";
import { requireAuth } from "../middlewares/requireAuth";
import { changePasswordController } from "../controllers/auth/changePasswordController";
import { refreshController } from "../controllers/auth/refreshController";

export const authRoutes = Router();

authRoutes.post("/signup", signupController);
authRoutes.post("/login", loginController);
authRoutes.put("/change-password", requireAuth, changePasswordController);
authRoutes.post("/refresh", refreshController);