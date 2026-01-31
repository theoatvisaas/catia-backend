import { NextFunction, Request, Response } from "express";

type AppError = {
    statusCode?: number;
    message?: string;
};

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction) {
    const statusCode = err.statusCode ?? 500;
    const message = err.message ?? "Internal server error";

    return res.status(statusCode).json({ message });
}
