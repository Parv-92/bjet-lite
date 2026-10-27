/**
 * Bjet Lite - Repository Error Hierarchy (Phase C3)
 */

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
