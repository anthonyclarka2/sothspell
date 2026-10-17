import { describe, expect, it, vi } from 'vitest';
import {
  EMBED_CHANNEL,
  embedCommand,
  embedMessage,
  isEmbedCommand,
  isEmbedMessage,
  postEmbedMessage,
} from './protocol.js';

describe('embed postMessage protocol', () => {
  it('builds an event envelope with the channel and payload', () => {
    const message = embedMessage('progress', { progress: 0.5 });

    expect(message).toEqual({
      channel: EMBED_CHANNEL,
      type: 'progress',
      payload: { progress: 0.5 },
    });
  });

  it('omits the payload key when there is nothing to send', () => {
    const message = embedMessage('ready');

    expect(Object.hasOwn(message, 'payload')).toBe(false);
  });

  it('accepts a well-formed event and rejects everything else', () => {
    expect(isEmbedMessage(embedMessage('complete'))).toBe(true);
    expect(isEmbedMessage({ channel: EMBED_CHANNEL, type: 'play' })).toBe(false);
    expect(isEmbedMessage({ channel: 'other', type: 'ready' })).toBe(false);
    expect(isEmbedMessage(null)).toBe(false);
    expect(isEmbedMessage('ready')).toBe(false);
    expect(isEmbedMessage({})).toBe(false);
  });

  it('accepts a well-formed host command and rejects event types', () => {
    expect(isEmbedCommand(embedCommand('seek', 0.25))).toBe(true);
    expect(isEmbedCommand({ channel: EMBED_CHANNEL, type: 'progress' })).toBe(false);
    expect(isEmbedCommand({ channel: EMBED_CHANNEL, type: 'nope' })).toBe(false);
    expect(isEmbedCommand(undefined)).toBe(false);
  });

  it('posts through the supplied target with a target origin', () => {
    const postMessage = vi.fn();
    const message = embedMessage('ready', { tourId: 'tour_1' });

    postEmbedMessage({ postMessage }, message, 'https://docs.example');

    expect(postMessage).toHaveBeenCalledWith(message, 'https://docs.example');
  });

  it('defaults the target origin to any origin', () => {
    const postMessage = vi.fn();

    postEmbedMessage({ postMessage }, embedCommand('play'));

    expect(postMessage).toHaveBeenCalledWith(embedCommand('play'), '*');
  });
});
