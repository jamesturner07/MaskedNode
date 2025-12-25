import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'MaskedNode',
  projectId: 'cc5a1f1681e84e669f7e9c8e63fa1648',
  chains: [sepolia],
  ssr: false,
});
