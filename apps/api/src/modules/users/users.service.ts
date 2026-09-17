import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
        agent: {
          select: {
            title: true,
            agency: { select: { id: true, name: true, status: true } },
          },
        },
        customer: { select: { phone: true, country: true } },
        employee: { select: { corporateId: true, departmentId: true, title: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      roles: user.roles.map((r) => r.role.name),
    };
  }
}
