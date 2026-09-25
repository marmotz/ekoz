import { describe, expect, it } from 'vitest';
import {
  AdminCreateUserBodySchema,
  AuthPolicySchema,
  ChangePasswordBodySchema,
  GroupListResponseSchema,
  LoginBodySchema,
  MembersPageSchema,
  MessageSchema,
  MessagesPageSchema,
  MyMentionsPageSchema,
  StreamTicketSchema,
  UnreadMentionsResponseSchema,
  UsernameChangeStateSchema,
} from './schemas.js';

describe('schemas', () => {
  it('accepts a valid AdminCreateUserBody payload', () => {
    const result = AdminCreateUserBodySchema.safeParse({
      name: 'jdoe',
      email: 'jdoe@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'John Doe',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an AdminCreateUserBody payload with an invalid email', () => {
    const result = AdminCreateUserBodySchema.safeParse({
      name: 'jdoe',
      email: 'not-an-email',
      password: 'correct-horse-battery-staple',
      displayName: 'John Doe',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an AdminCreateUserBody payload missing required fields', () => {
    const result = AdminCreateUserBodySchema.safeParse({
      email: 'jdoe@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid LoginBody payload', () => {
    const result = LoginBodySchema.safeParse({
      identifier: 'jdoe@example.com',
      password: 'correct-horse-battery-staple',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a LoginBody payload with an empty password', () => {
    const result = LoginBodySchema.safeParse({
      identifier: 'jdoe@example.com',
      password: '',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid AuthPolicy payload', () => {
    const result = AuthPolicySchema.safeParse({
      registrationMode: 'invite',
      emailVerificationRequired: true,
      passwordMinLength: 10,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an AuthPolicy payload with an unknown registration mode', () => {
    const result = AuthPolicySchema.safeParse({
      registrationMode: 'anyone',
      emailVerificationRequired: true,
      passwordMinLength: 10,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an AuthPolicy payload missing required fields', () => {
    const result = AuthPolicySchema.safeParse({ registrationMode: 'open' });

    expect(result.success).toBe(false);
  });

  it('validates ChangePasswordBody and rejects an empty current password', () => {
    expect(
      ChangePasswordBodySchema.safeParse({ currentPassword: 'old', newPassword: 'new-pass-123' })
        .success,
    ).toBe(true);
    expect(
      ChangePasswordBodySchema.safeParse({ currentPassword: '', newPassword: 'new-pass-123' })
        .success,
    ).toBe(false);
  });

  it('validates UsernameChangeState with and without a pending request', () => {
    const pending = UsernameChangeStateSchema.safeParse({
      policy: 'approval',
      nextChangeAt: null,
      pendingRequest: {
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        requestedName: 'bob',
        createdAt: '2026-09-23T10:00:00.000Z',
      },
    });
    expect(pending.success).toBe(true);
    expect(
      UsernameChangeStateSchema.safeParse({
        policy: 'free',
        nextChangeAt: null,
        pendingRequest: null,
      }).success,
    ).toBe(true);
    expect(
      UsernameChangeStateSchema.safeParse({
        policy: 'free',
        nextChangeAt: null,
        pendingRequest: { id: 'x' },
      }).success,
    ).toBe(false);
  });

  it('validates the web chat wire schemas', () => {
    const message = {
      id: '01HZX0000000000000000000AA',
      roomId: '01HZX0000000000000000000BB',
      seq: '3',
      authorId: null,
      body: 'hello',
      replyToId: null,
      mentions: [{ type: 'user', target: '01HZX0000000000000000000CC', token: '@bob/example.com' }],
      mentionsMe: 'direct',
      editedAt: null,
      redactedAt: null,
      hiddenAt: null,
      createdAt: '2026-09-23T10:00:00.000Z',
    };
    expect(MessageSchema.safeParse(message).success).toBe(true);
    expect(MessageSchema.safeParse({ ...message, seq: 3 }).success).toBe(false);
    expect(
      MessageSchema.safeParse({
        ...message,
        mentions: [{ type: 'user', target: 'x', token: '@x' }],
      }).success,
    ).toBe(true);
    expect(
      MessageSchema.safeParse({ ...message, mentions: ['01HZX0000000000000000000CC'] }).success,
    ).toBe(false);
    expect(MessageSchema.safeParse({ ...message, mentionsMe: null }).success).toBe(true);
    expect(
      MessagesPageSchema.safeParse({
        items: [message],
        lastSeq: '3',
        hasMore: false,
        hasMoreNewer: false,
      }).success,
    ).toBe(true);
    expect(
      MyMentionsPageSchema.safeParse({
        items: [
          {
            message,
            room: { id: 'r1', type: 'channel', name: 'general', parentId: null },
            mentionsMe: 'direct',
            unread: true,
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(true);
    expect(
      UnreadMentionsResponseSchema.safeParse({
        items: [{ roomId: 'r1', direct: 1, collective: 0 }],
      }).success,
    ).toBe(true);
    expect(GroupListResponseSchema.safeParse({ items: [{ id: 'g' }] }).success).toBe(false);
    expect(MembersPageSchema.safeParse({ items: [], nextCursor: null }).success).toBe(true);
    expect(StreamTicketSchema.safeParse({ ticket: 't', expiresIn: 30 }).success).toBe(true);
    expect(StreamTicketSchema.safeParse({ ticket: 't' }).success).toBe(false);
  });
});
