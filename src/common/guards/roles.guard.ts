import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();

        console.log('RolesGuard Debug:');
        console.log('Required roles:', requiredRoles);
        console.log('User object:', user);
        console.log('User role:', user?.role);
        console.log('Role match result:', requiredRoles.some((role) => user.role === role));

        if (!user) {
            console.log('No user found in request');
            return false;
        }

        const hasRole = requiredRoles.some((role) => user.role === role);
        console.log('Access granted:', hasRole);
        return hasRole;
    }
}
