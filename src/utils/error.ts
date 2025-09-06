export class AppError extends Error {
  public status: number;
  public details?: any;

  constructor(message: string, status = 400, details?: any) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.details = details;
    // Ensure prototype chain is set correctly
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Convert an unknown thrown value into a plain object
 * suitable for sending as JSON in responses.
 */
export function formatError(err: unknown): { error: string; status: number; details?: any } {
  if (err instanceof AppError) {
    return { error: err.message, status: err.status, details: err.details };
  }
  if (err instanceof Error) {
    return { error: err.message, status: 500 };
  }
  return { error: String(err), status: 500 };
}
