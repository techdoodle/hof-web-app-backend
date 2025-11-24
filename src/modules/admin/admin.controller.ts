import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query, UploadedFile, UseInterceptors, ParseIntPipe, Res } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserFilterDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { AdminService } from './admin.service';
import { CreateMatchDto, UpdateMatchDto, MatchFilterDto, CreateRecurringMatchesDto } from './dto/match.dto';
import { PlayerNationSubmitDto } from './dto/playernation-submit.dto';
import { SaveMappingsDto } from './dto/playernation-mapping.dto';
import { PlayerNationService } from './services/playernation.service';
import { VenueCsvUploadService } from './services/venue-excel-upload.service';
import { FirebaseStorageService } from '../user/firebase-storage.service';
import { PlayerNationPlayerMapping } from './entities/playernation-player-mapping.entity';

@Controller('admin')
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly playerNationService: PlayerNationService,
        private readonly venueCsvUploadService: VenueCsvUploadService,
        private readonly firebaseStorageService: FirebaseStorageService,
    ) { }

    // User Management - Admin and Super Admin only
    @Get('users')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getAllUsers(@Query() raw: any) {
        let filters: any = { ...raw };
        if (raw && typeof raw.filter === 'string') {
            try {
                filters = { ...filters, ...JSON.parse(raw.filter) };
            } catch (_) {}
        }
        // Normalize common keys if sent as nested
        if (filters['city.id'] && !filters.city) filters.city = filters['city.id'];
        return this.adminService.getAllUsers(filters as UserFilterDto);
    }

    @Get('chiefs')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getChiefs(@Query() raw: any) {
        return this.adminService.getChiefs();
    }

    @Get('users/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getUser(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getUser(id);
    }

    @Post('users')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async createUser(@Body() createUserDto: CreateUserDto) {
        return this.adminService.createUser(createUserDto);
    }

    @Patch('users/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async updateUser(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateUserDto: UpdateUserDto
    ) {
        return this.adminService.updateUser(id, updateUserDto);
    }

    @Delete('users/:id')
    @Roles(UserRole.SUPER_ADMIN) // Only super admin can delete users
    async deleteUser(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.deleteUser(id);
    }

    // Match Management - Football Chief, Academy Admin, Admin, Super Admin
    @Get('matches')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getAllMatches(@Query() raw: any) {
        // React Admin passes filters under a `filter` query param (JSON string)
        let filters: any = { ...raw };
        if (raw && typeof raw.filter === 'string') {
            try {
                const parsed = JSON.parse(raw.filter);
                filters = { ...filters, ...parsed };
            } catch (_) {
                // ignore parse errors
            }
        }

        // Normalize common aliases from UI
        // Map startTime/endTime -> startDate/endDate for backward compatibility
        if (filters.startTime && !filters.startDate) filters.startDate = filters.startTime;
        if (filters.endTime && !filters.endDate) filters.endDate = filters.endTime;

        // Normalize nested filter keys that RA may send (e.g., 'venue.id')
        if (filters['venue.id'] && !filters.venue) filters.venue = filters['venue.id'];
        if (filters['city.id'] && !filters.city) filters.city = filters['city.id'];
        if (filters['footballChief.id'] && !filters.footballChief) filters.footballChief = filters['footballChief.id'];

        // Coerce possible object-valued filters to primitive IDs
        const coerceId = (val: any) => {
            if (!val) return val;
            // Drop stringified object placeholders
            if (val === '[object Object]') return null;
            if (typeof val === 'object') return val.id ?? val.value ?? null;
            if (typeof val === 'string' && /^\d+$/.test(val)) return Number(val);
            return val;
        };
        filters.venue = coerceId(filters.venue);
        filters.city = coerceId(filters.city);
        filters.footballChief = coerceId(filters.footballChief);

        // Remove empty/invalid ids so they don't trigger 500s
        if (filters.venue === null || filters.venue === undefined || Number.isNaN(filters.venue)) delete filters.venue;
        if (filters.city === null || filters.city === undefined || Number.isNaN(filters.city)) delete filters.city;
        if (filters.footballChief === null || filters.footballChief === undefined || Number.isNaN(filters.footballChief)) delete filters.footballChief;

        return this.adminService.getAllMatches(filters as MatchFilterDto);
    }

    @Get('matches/:id')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMatch(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getMatch(id);
    }

    @Post('matches')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async createMatch(@Body() createMatchDto: CreateMatchDto) {
        return this.adminService.createMatch(createMatchDto);
    }

    @Post('matches/recurring')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async createRecurringMatches(@Body() dto: CreateRecurringMatchesDto) {
        return this.adminService.createRecurringMatches(dto);
    }

    @Patch('matches/:id')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async updateMatch(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateMatchDto: UpdateMatchDto
    ) {
        return this.adminService.updateMatch(id, updateMatchDto);
    }

    @Get('matches/:id/cancel-preview')
    @Roles(UserRole.SUPER_ADMIN) // Only super admin can preview match cancellation
    async getMatchCancellationPreview(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getMatchCancellationPreview(id);
    }

    @Delete('matches/:id/cancel')
    @Roles(UserRole.SUPER_ADMIN) // Only super admin can cancel matches
    async cancelMatch(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.cancelMatchWithRefunds(id);
    }

    // Match Participants Management
    @Get('match-participants')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getAllMatchParticipants(@Query() query: any) {
        return this.adminService.getAllMatchParticipants(query);
    }

    @Get('matches/:id/participants')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMatchParticipants(@Param('id', ParseIntPipe) matchId: number) {
        return this.adminService.getMatchParticipants(matchId);
    }

    @Post('matches/:id/participants')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async addMatchParticipant(
        @Param('id', ParseIntPipe) matchId: number,
        @Body() participantData: any
    ) {
        return this.adminService.addMatchParticipant(matchId, participantData);
    }

    @Delete('matches/:matchId/participants/:userId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async removeMatchParticipant(
        @Param('matchId', ParseIntPipe) matchId: number,
        @Param('userId', ParseIntPipe) userId: number,
        @Body() body?: { shouldRefund?: boolean }
    ) {
        const shouldRefund = body?.shouldRefund ?? false;
        return this.adminService.removeMatchParticipant(matchId, userId, shouldRefund);
    }

    // CSV Upload Preview - doesn't actually save to database
    @Post('matches/:id/preview-csv')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @UseInterceptors(FileInterceptor('file'))
    async previewCsvUpload(
        @Param('id', ParseIntPipe) matchId: number,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.adminService.previewCsvUpload(file, matchId);
    }

    // Final CSV Upload - saves to database after admin review
    @Post('matches/:id/upload-stats')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async uploadMatchStats(
        @Param('id', ParseIntPipe) matchId: number,
        @Body() csvData: any[]
    ) {
        return this.adminService.uploadMatchStats(matchId, csvData);
    }

    // MVP Selection
    @Patch('matches/:id/mvp')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async setMatchMvp(
        @Param('id', ParseIntPipe) matchId: number,
        @Body() mvpData: { userId: number }
    ) {
        return this.adminService.setMatchMvp(matchId, mvpData.userId);
    }

    // Football Teams - reference data only (for user favorite teams)
    @Get('football-teams')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getFootballTeams(@Query() query: any) {
        return this.adminService.getFootballTeams(query);
    }

    // Cities - reference data only
    @Get('cities')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getCities(@Query() query: any) {
        return this.adminService.getCities(query);
    }

    // Venue Management
    @Get('venues')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getVenues(@Query() query: any) {
        return this.adminService.getVenues(query);
    }

    @Get('venues/csv-template')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getVenuesCsvTemplate(@Res() res: Response) {
        try {
            const buffer = this.venueCsvUploadService.generateCsvTemplate();
            if (!buffer || buffer.length === 0) {
                return res.status(500).json({ message: 'Failed to generate CSV template: empty buffer' });
            }
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=venue_template.csv');
            res.send(buffer);
        } catch (error: any) {
            console.error('Error generating CSV template:', error);
            res.status(500).json({ message: 'Failed to generate CSV template', error: error?.message || String(error) });
        }
    }

    @Get('venues/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN)
    async getVenue(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.getVenue(id);
    }

    @Post('venues')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async createVenue(@Body() createVenueDto: any) {
        return this.adminService.createVenue(createVenueDto);
    }

    @Patch('venues/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async updateVenue(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateVenueDto: any
    ) {
        return this.adminService.updateVenue(id, updateVenueDto);
    }

    @Delete('venues/:id')
    @Roles(UserRole.SUPER_ADMIN)
    async deleteVenue(@Param('id', ParseIntPipe) id: number) {
        return this.adminService.deleteVenue(id);
    }

    @Post('venues/upload-csv')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @UseInterceptors(FileInterceptor('file'))
    async uploadVenuesCsv(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new Error('No file uploaded');
        }

        const data = await this.venueCsvUploadService.parseCsvFile(file);
        const result = await this.venueCsvUploadService.processVenueUpload(data);

        return {
            message: `Successfully processed ${result.created + result.updated} venues (${result.created} created, ${result.updated} updated)`,
            created: result.created,
            updated: result.updated,
            errors: result.errors,
            failedVenues: result.failedVenues,
        };
    }

    // Match Types
    @Get('match_types')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMatchTypes(@Query() query: any) {
        console.log('inside getMatchTypes', query);
        return this.adminService.getMatchTypes(query);
    }

    @Get('match_types/:id')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMatchType(@Param('id', ParseIntPipe) id: number) {
        console.log('inside getMatchType', id);
        return this.adminService.getMatchType(id);
    }

    // PlayerNation Integration - Football Chief, Academy Admin, Admin, Super Admin
    @Post('playernation/submit/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async submitToPlayerNation(
        @Param('matchId', ParseIntPipe) matchId: number,
        @Body() payload: PlayerNationSubmitDto
    ) {
        console.log('=== PLAYERNATION SUBMIT ===', { 
            matchId, 
            teamAPlayerCount: payload.players?.teamA?.length || 0,
            teamBPlayerCount: payload.players?.teamB?.length || 0,
            totalPlayerCount: (payload.players?.teamA?.length || 0) + (payload.players?.teamB?.length || 0)
        });
        
        try {
            const result = await this.playerNationService.submitMatch(matchId, payload);
            console.log('PlayerNation submit success:', result);
            return result;
        } catch (error) {
            console.error('PlayerNation submit error:', error.message);
            throw error;
        }
    }

    @Get('playernation/status/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getPlayerNationStatus(@Param('matchId', ParseIntPipe) matchId: number) {
        return this.playerNationService.getMatchStatus(matchId);
    }

    @Post('playernation/poll-now/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async pollNow(@Param('matchId', ParseIntPipe) matchId: number) {
        await this.playerNationService.pollMatchStats(matchId);
        return { message: 'Poll initiated successfully' };
    }

    // Support GET for clients that invoke poll via GET
    @Get('playernation/poll-now/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async pollNowGet(@Param('matchId', ParseIntPipe) matchId: number) {
        await this.playerNationService.pollMatchStats(matchId);
        return { message: 'Poll initiated successfully' };
    }

    @Post('playernation/process-stats/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async processMatchedStats(@Param('matchId', ParseIntPipe) matchId: number) {
        const result = await this.playerNationService.processMatchedPlayerStats(matchId);
        return { message: 'Stats processed', ...result };
    }

    @Get('playernation/unmapped-count/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getUnmappedCount(@Param('matchId', ParseIntPipe) matchId: number) {
        const count = await this.playerNationService.getUnmappedPlayers(matchId);
        return { count: (count || []).length };
    }

    @Get('playernation/unmapped/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getUnmappedPlayers(@Param('matchId', ParseIntPipe) matchId: number): Promise<PlayerNationPlayerMapping[]> {
        return this.playerNationService.getUnmappedPlayers(matchId);
    }

    @Get('playernation/mappings/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getMappings(@Param('matchId', ParseIntPipe) matchId: number) {
        return this.playerNationService.getMappings(matchId);
    }

    @Post('playernation/mappings/purge-all')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async purgeAllMappings() {
        return this.playerNationService.purgeAllMappings();
    }

    @Post('playernation/save-mappings/:matchId')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async saveMappings(
        @Param('matchId', ParseIntPipe) matchId: number,
        @Body() mappings: SaveMappingsDto['mappings']
    ) {
        await this.playerNationService.saveMappings(matchId, mappings);
        return { message: 'Mappings saved successfully' };
    }

    @Post('playernation/signed-url')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getSignedUploadUrl(@Body() body: { fileName: string; contentType: string }) {
        const { uploadUrl, downloadUrl } = await this.firebaseStorageService.generateSignedUploadUrl(
            body.fileName,
            body.contentType
        );
        
        return {
            uploadUrl,
            downloadUrl,
            fileName: body.fileName,
            contentType: body.contentType
        };
    }

    @Post('playernation/upload-video')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async uploadVideo(@Body() body: { fileName: string; contentType: string; base64Data: string; participantId: number; matchId: number }) {
        try {
            // Convert base64 to buffer
            const buffer = Buffer.from(body.base64Data, 'base64');
            
            // Upload to Firebase Storage
            const downloadUrl = await this.firebaseStorageService.uploadPlayerNationVideo(
                body.fileName,
                buffer,
                body.contentType
            );
            
            // Save video URL to database
            await this.adminService.updateParticipantVideoUrl(body.participantId, body.matchId, downloadUrl);
            
            return {
                downloadUrl,
                fileName: body.fileName,
                contentType: body.contentType
            };
        } catch (error) {
            console.error('Video upload error:', error);
            throw new Error('Failed to upload video');
        }
    }

    @Post('playernation/clear-video')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async clearVideo(@Body() body: { participantId: number; matchId: number }) {
        try {
            await this.adminService.updateParticipantVideoUrl(body.participantId, body.matchId, null);
            return { message: 'Video cleared successfully' };
        } catch (error) {
            console.error('Clear video error:', error);
            throw new Error('Failed to clear video');
        }
    }

    @Get('test')
    async testEndpoint() {
        return { message: 'Test endpoint working' };
    }

    @Get('public-test')
    @UseGuards() // No guards for this endpoint
    async publicTestEndpoint() {
        return { 
            message: 'Public test endpoint working',
            timestamp: new Date().toISOString(),
            playerNationServiceAvailable: !!this.playerNationService
        };
    }

    @Get('playernation/test')
    @Roles(UserRole.FOOTBALL_CHIEF, UserRole.ACADEMY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async testPlayerNation() {
        console.log('=== PLAYERNATION TEST ENDPOINT CALLED ===');
        console.log('PlayerNationService available:', !!this.playerNationService);
        
        try {
            const token = await this.playerNationService.getValidToken();
            return { 
                message: 'PlayerNation service working', 
                tokenLength: token ? token.length : 0,
                hasToken: !!token
            };
        } catch (error) {
            console.error('PlayerNation test error:', error);
            return { 
                message: 'PlayerNation service error', 
                error: error.message 
            };
        }
    }
}
