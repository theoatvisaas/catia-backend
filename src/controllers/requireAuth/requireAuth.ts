import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type JwtPayload = {
    sub: string;
};

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;

    if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Missing token" });
    }

    const token = auth.slice("Bearer ".length).trim();

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
        req.userId = payload.sub;
        return next();
    } catch {
        return res.status(401).json({ message: "Invalid token" });
    }
}
