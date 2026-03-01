import { describe, it, expect, beforeEach } from 'vitest';
import { acquireDirectoryLock, _resetLocksForTest } from '../mutex.js';

beforeEach(() => {
  _resetLocksForTest();
});

describe('acquireDirectoryLock', () => {
  it('ロックを取得して解放できる', async () => {
    const unlock = await acquireDirectoryLock('/mnt/c/test');
    expect(typeof unlock).toBe('function');
    unlock();
  });

  it('同じディレクトリのロックは直列化される', async () => {
    const order: number[] = [];

    const unlock1 = await acquireDirectoryLock('/mnt/c/test');

    // Start second lock acquisition (will wait for unlock1)
    const lock2Promise = acquireDirectoryLock('/mnt/c/test').then((unlock2) => {
      order.push(2);
      unlock2();
    });

    // First lock is still held
    order.push(1);
    unlock1();

    await lock2Promise;

    expect(order).toEqual([1, 2]);
  });

  it('異なるディレクトリは並行実行できる', async () => {
    const unlock1 = await acquireDirectoryLock('/mnt/c/dir1');
    const unlock2 = await acquireDirectoryLock('/mnt/c/dir2');

    // Both locks acquired without waiting
    expect(typeof unlock1).toBe('function');
    expect(typeof unlock2).toBe('function');

    unlock1();
    unlock2();
  });

  it('キーはcase-insensitiveで比較される', async () => {
    const order: number[] = [];

    const unlock1 = await acquireDirectoryLock('/mnt/c/Test');

    const lock2Promise = acquireDirectoryLock('/mnt/c/test').then((unlock2) => {
      order.push(2);
      unlock2();
    });

    order.push(1);
    unlock1();

    await lock2Promise;

    // Should serialize because /mnt/c/Test and /mnt/c/test are the same directory
    expect(order).toEqual([1, 2]);
  });

  it('3つの並行ロックが順序通りに直列化される', async () => {
    const order: number[] = [];

    const unlock1 = await acquireDirectoryLock('/mnt/c/test');

    const lock2Promise = acquireDirectoryLock('/mnt/c/test').then((unlock2) => {
      order.push(2);
      unlock2();
    });

    const lock3Promise = acquireDirectoryLock('/mnt/c/test').then((unlock3) => {
      order.push(3);
      unlock3();
    });

    order.push(1);
    unlock1();

    await Promise.all([lock2Promise, lock3Promise]);

    expect(order).toEqual([1, 2, 3]);
  });
});
