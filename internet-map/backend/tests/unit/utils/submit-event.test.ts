import { EventEmitter } from 'events';
import { SubmitEvent } from '../../../src/utils/submit-event';

function createEndedStream() {
  const stream = new EventEmitter();
  process.nextTick(() => stream.emit('end'));
  return stream;
}

describe('SubmitEvent dockerode interactions', () => {
  it('executes a command inside a container through dockerode', async () => {
    const stream = createEndedStream();
    const inspect = jest.fn().mockResolvedValue({ ExitCode: 0 });
    const start = jest.fn().mockResolvedValue(stream);
    const exec = jest.fn().mockResolvedValue({ start, inspect });
    const getContainer = jest.fn().mockReturnValue({ exec });
    const demuxStream = jest.fn();
    const docker = { getContainer, modem: { demuxStream } };
    const service = new SubmitEvent(docker as any);

    await service.execCmdInContainer('node-1', ['rm', '-f', '/tmp/plugin.sh']);

    expect(getContainer).toHaveBeenCalledWith('node-1');
    expect(exec).toHaveBeenCalledWith({
      Cmd: ['rm', '-f', '/tmp/plugin.sh'],
      AttachStdout: true,
      AttachStderr: true,
    });
    expect(start).toHaveBeenCalledWith({ hijack: true, stdin: false });
    expect(demuxStream).toHaveBeenCalledWith(stream, process.stdout, process.stderr);
  });

  it('raises docker execution failures to callers', async () => {
    const stream = createEndedStream();
    const inspect = jest.fn().mockResolvedValue({ ExitCode: 1 });
    const start = jest.fn().mockResolvedValue(stream);
    const exec = jest.fn().mockResolvedValue({ start, inspect });
    const docker = {
      getContainer: jest.fn().mockReturnValue({ exec }),
      modem: { demuxStream: jest.fn() },
    };
    const service = new SubmitEvent(docker as any);

    await expect(service.execCmdInContainer('node-1', ['false'])).rejects.toThrow(
      'Failed to exec cmd'
    );
  });
});
