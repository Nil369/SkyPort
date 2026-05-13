import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { vpsApi, updateApi } from '@/services/api';
import toast from 'react-hot-toast';

export function useVPSList(options?: { offset?: number; limit?: number }) {
  return useQuery({
    queryKey: ['vps-list', options],
    queryFn: () => vpsApi.listVPS(options),
    refetchInterval: 30000,
  });
}

export function useVPS(vpsId: string) {
  return useQuery({
    queryKey: ['vps', vpsId],
    queryFn: () => vpsApi.getVPS(vpsId),
    enabled: !!vpsId,
  });
}

export function useCreateVPS() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: vpsApi.createVPS,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vps-list'] });
      toast.success('VPS created successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to create VPS: ${error.response?.data?.error || error.message}`);
    },
  });
}

export function useUpdateVPS(vpsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => vpsApi.updateVPS(vpsId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vps', vpsId] });
      queryClient.invalidateQueries({ queryKey: ['vps-list'] });
      toast.success('VPS updated successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to update VPS: ${error.response?.data?.error || error.message}`);
    },
  });
}

export function useDeleteVPS() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: vpsApi.deleteVPS,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vps-list'] });
      toast.success('VPS deleted successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete VPS: ${error.response?.data?.error || error.message}`);
    },
  });
}

export function useTestSSHConnection() {
  return useMutation({
    mutationFn: vpsApi.testConnection,
    onSuccess: (result: any) => {
      if (result.data?.success) {
        toast.success('SSH connection successful!');
      } else {
        toast.error(`Connection failed: ${result.data?.error || 'Unknown error'}`);
      }
    },
    onError: (error: any) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });
}

export function useCheckForUpdates() {
  return useQuery({
    queryKey: ['updates-check'],
    queryFn: updateApi.checkForUpdates,
    refetchInterval: 3600000, // Check every hour
    staleTime: 3600000,
  });
}

export function useLatestRelease() {
  return useQuery({
    queryKey: ['latest-release'],
    queryFn: updateApi.getLatestRelease,
    staleTime: 3600000,
  });
}

// WebSocket hook for SSH terminal
export function useSSHTerminal(vpsId: string) {
  const setupConnection = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/vps/${vpsId}`;

    const ws = new WebSocket(wsUrl);

    return ws;
  }, [vpsId]);

  return {
    setupConnection,
  };
}

// Terminal resize handling
export function useTerminalResize(callback: (cols: number, rows: number) => void) {
  const handleResize = useCallback(() => {
    if (typeof window !== 'undefined') {
      const cols = Math.floor(window.innerWidth / 10); // Rough estimate
      const rows = Math.floor(window.innerHeight / 20); // Rough estimate
      callback(cols, rows);
    }
  }, [callback]);

  return {
    handleResize,
  };
}
