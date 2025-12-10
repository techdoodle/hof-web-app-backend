import {
    BadRequestException,
    Controller,
    Get,
    Logger,
    Options,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

const ALLOWED_HOSTS = [
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
];

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300',
    'Cross-Origin-Resource-Policy': 'cross-origin',
};

@Controller()
export class ImageProxyController {
    private readonly logger = new Logger(ImageProxyController.name);

    @Options('image-proxy')
    @Public()
    @SkipThrottle()
    handleOptions(@Res() res: Response) {
        res.set(CORS_HEADERS);
        res.status(204).send();
    }

    @Get('image-proxy')
    @SkipThrottle()
    @UseGuards(JwtAuthGuard)
    async proxy(@Query('url') url: string | undefined, @Res() res: Response) {
        res.set(CORS_HEADERS);

        if (!url) {
            throw new BadRequestException('url is required');
        }

        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new BadRequestException('invalid url');
        }

        if (!['https:', 'http:'].includes(parsed.protocol)) {
            throw new BadRequestException('protocol not allowed');
        }

        const hostAllowed = ALLOWED_HOSTS.some((host) =>
            parsed.hostname.endsWith(host),
        );
        if (!hostAllowed) {
            throw new BadRequestException('host not allowed');
        }

        try {
            const upstream = await fetch(parsed.toString(), {
                cache: 'no-store',
            });

            if (!upstream.ok) {
                this.logger.warn(
                    `image-proxy upstream error ${upstream.status} for ${parsed.hostname}`,
                );
                res.status(upstream.status).json({
                    error: 'upstream error',
                    status: upstream.status,
                });
                return;
            }

            const contentType =
                upstream.headers.get('content-type') || 'application/octet-stream';
            const arrayBuffer = await upstream.arrayBuffer();

            res.setHeader('Content-Type', contentType);
            res.send(Buffer.from(arrayBuffer));
        } catch (error) {
            this.logger.error('image-proxy failed', error as any);
            res.status(500).json({ error: 'proxy failed' });
        }
    }
}

