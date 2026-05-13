import DOMPurify from 'isomorphic-dompurify';
import { Request, Response, NextFunction } from 'express';

/**
 * Sanitization middleware to prevent XSS attacks
 * @param fields - Array of field names to sanitize in req.body
 */
export const sanitize = (fields: string[]) => (req: Request, _res: Response, next: NextFunction) => {
  for (const field of fields) {
    if (req.body[field] && typeof req.body[field] === 'string') {
      req.body[field] = DOMPurify.sanitize(req.body[field]);
    }
  }
  next();
};
