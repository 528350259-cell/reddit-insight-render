export interface FeishuUrlVerificationEvent {
  type: 'url_verification';
  token?: string;
  challenge: string;
}

export interface FeishuMessageEventPayload {
  type?: 'event_callback';
  token?: string;
  challenge?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    tenant_key?: string;
    app_id?: string;
    create_time?: string;
    token?: string;
  };
  event?: {
    sender?: {
      sender_id?: {
        open_id?: string;
        union_id?: string;
        user_id?: string;
      };
      sender_type?: string;
      tenant_key?: string;
    };
    message?: {
      message_id: string;
      root_id?: string;
      parent_id?: string;
      create_time?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
      mentions?: Array<{
        key?: string;
        id?: {
          open_id?: string;
          union_id?: string;
          user_id?: string;
        };
        name?: string;
        tenant_key?: string;
      }>;
    };
  };
}

export type FeishuEventPayload = FeishuUrlVerificationEvent | FeishuMessageEventPayload;

export interface FeishuCliMessageEvent {
  type: 'im.message.receive_v1';
  event_id?: string;
  message_id?: string;
  id?: string;
  sender_id?: string;
  chat_id?: string;
  chat_type?: 'p2p' | 'group';
  message_type?: string;
  content?: string;
  create_time?: string;
  timestamp?: string;
}
