import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// Icons from nexusnetwork/src/components/BottomNav.jsx, path for path.
// .bn-icon svg: 26×26, stroke muted (accent when active), width 1.8 (2.2 active).

type IconProps = { active: boolean };

const SIZE = 26;
const stroke = (active: boolean) => (active ? colors.accent : colors.muted);
const width = (active: boolean) => (active ? 2.2 : 1.8);

export function HomeIcon({ active }: IconProps) {
  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke(active)}
      strokeWidth={width(active)}
    >
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9,22 9,12 15,12 15,22" />
    </Svg>
  );
}

export function FollowingIcon({ active }: IconProps) {
  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke(active)}
      strokeWidth={width(active)}
    >
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <Circle
        cx="19"
        cy="4"
        r="3"
        fill={active ? colors.accent : 'none'}
        stroke={active ? colors.accent : colors.dim}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

export function PostIcon() {
  // .bn-center .bn-icon svg: white, 22×22
  return (
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.white}
      strokeWidth={2.5}
    >
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

export function ConnectIcon({ active }: IconProps) {
  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke(active)}
      strokeWidth={width(active)}
    >
      <Circle cx="11" cy="11" r="7" />
      <Line x1="20" y1="20" x2="16.5" y2="16.5" />
      <Circle
        cx="17"
        cy="7"
        r="3"
        fill={active ? colors.accent : 'none'}
        stroke={active ? colors.accent : colors.dim}
        strokeWidth={1.5}
      />
      <Path
        d="M16 7l1 1 2-2"
        stroke={active ? colors.white : colors.dim}
        strokeWidth={1.5}
        fill="none"
      />
    </Svg>
  );
}

export function MeIcon({ active }: IconProps) {
  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke(active)}
      strokeWidth={width(active)}
    >
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  );
}
