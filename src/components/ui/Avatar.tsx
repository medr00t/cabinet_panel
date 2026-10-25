import { colorFor, initials } from '../../utils/format';

const Avatar = ({ first, last, large }: { first: string; last: string; large?: boolean }) => (
  <span className={`avatar ${large ? 'lg' : ''}`} style={{ background: colorFor(first + last) }} aria-hidden="true">
    {initials(first, last)}
  </span>
);

export default Avatar;
