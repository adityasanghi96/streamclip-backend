import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../env";
import AppDataSource from "../db/data-source";
import { User } from "../db/entities/User";

type AuthedRequest = Request & { user?: User };

export function getAuthUser(req: Request): User {
  const user = (req as AuthedRequest).user;
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, ENV.JWT_SECRET) as { userId: number };
    const user = await AppDataSource.getRepository(User).findOneBy({ id: payload.userId });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    (req as AuthedRequest).user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
