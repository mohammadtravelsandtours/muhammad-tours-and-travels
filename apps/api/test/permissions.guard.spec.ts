import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@mohammad-travels/types';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';

function mockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows the request when no permissions are required', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(mockContext(undefined))).toBe(true);
  });

  it('allows the request when the user has every required permission', () => {
    const reflector = {
      getAllAndOverride: () => [Permission.BOOKING_READ_ANY],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = mockContext({ id: 'u1', permissions: [Permission.BOOKING_READ_ANY] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies the request when a required permission is missing', () => {
    const reflector = {
      getAllAndOverride: () => [Permission.SUPPLIERS_MANAGE],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = mockContext({ id: 'u1', permissions: [Permission.BOOKING_READ_ANY] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies the request when there is no authenticated user at all', () => {
    const reflector = {
      getAllAndOverride: () => [Permission.SUPPLIERS_MANAGE],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
  });
});
