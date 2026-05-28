export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    statusCode: number;
    message: string;
    details?: any;
    code?: string;
  };
  timestamp: string;
}
