import { Router } from "express";
import { signupController } from "../controllers/auth/signUpController";
import { loginController } from "../controllers/auth/loginController";
import { requireAuth } from "../middlewares/requireAuth";
import { changePasswordController } from "../controllers/auth/changePasswordController";
import { refreshController } from "../controllers/auth/refreshController";
import { meController } from "../controllers/auth/meController";

export const authRoutes = Router();

authRoutes.post("/signup", signupController);
authRoutes.post("/login", loginController);
authRoutes.get("/me", requireAuth, meController); 
authRoutes.put("/change-password", requireAuth, changePasswordController);
authRoutes.post("/refresh", refreshController);
