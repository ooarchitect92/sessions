export interface EmailSendRequest {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

export interface EmailSendResult {
  provider: string;
  messageId?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(request: EmailSendRequest): Promise<EmailSendResult>;
}
