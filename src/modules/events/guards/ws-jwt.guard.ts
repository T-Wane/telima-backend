import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      throw new UnauthorizedException('Token JWT manquant dans handshake WebSocket');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      (client as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token JWT invalide ou expiré');
    }
  }
}
