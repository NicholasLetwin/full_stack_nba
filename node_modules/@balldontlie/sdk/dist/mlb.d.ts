import { BaseClient, ApiResponse, MLBTeam, MLBPlayer, MLBGame, MLBStats, MLBStandings, MLBSeasonStats, MLBTeamSeasonStats, MLBPlayerInjury } from "./types";
export declare class MLBClient extends BaseClient {
    getTeams(params?: {
        division?: string;
        league?: string;
    }): Promise<ApiResponse<MLBTeam[]>>;
    getTeam(id: number): Promise<ApiResponse<MLBTeam>>;
    getPlayers(params?: {
        cursor?: number;
        per_page?: number;
        team_ids?: number[];
        player_ids?: number[];
        search?: string;
        first_name?: string;
        last_name?: string;
    }): Promise<ApiResponse<MLBPlayer[]>>;
    getActivePlayers(params?: {
        cursor?: number;
        per_page?: number;
        team_ids?: number[];
        player_ids?: number[];
        search?: string;
        first_name?: string;
        last_name?: string;
    }): Promise<ApiResponse<MLBPlayer[]>>;
    getGames(params?: {
        cursor?: number;
        per_page?: number;
        dates?: string[];
        team_ids?: number[];
        seasons?: number[];
        postseason?: boolean;
    }): Promise<ApiResponse<MLBGame[]>>;
    getGame(id: number): Promise<ApiResponse<MLBGame>>;
    getStats(params?: {
        cursor?: number;
        per_page?: number;
        player_ids?: number[];
        game_ids?: number[];
        seasons?: number[];
    }): Promise<ApiResponse<MLBStats[]>>;
    getStandings(params: {
        season: number;
    }): Promise<ApiResponse<MLBStandings[]>>;
    getPlayerInjuries(params?: {
        cursor?: number;
        per_page?: number;
        team_ids?: number[];
        player_ids?: number[];
    }): Promise<ApiResponse<MLBPlayerInjury[]>>;
    getSeasonStats(params: {
        season: number;
        player_ids?: number[];
        team_id?: number;
        postseason?: boolean;
        sort_by?: string;
        sort_order?: "asc" | "desc";
    }): Promise<ApiResponse<MLBSeasonStats[]>>;
    getTeamSeasonStats(params: {
        season: number;
        team_id?: number;
        postseason?: boolean;
    }): Promise<ApiResponse<MLBTeamSeasonStats[]>>;
}
