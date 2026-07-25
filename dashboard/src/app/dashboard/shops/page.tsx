import { ShopsClient } from '@/components/shops/ShopsClient';

const shops = [
  { id: 1, name: 'Downtown Store', status: 'Active', owner: 'Alicia' },
  { id: 2, name: 'Northside Hub', status: 'Pending', owner: 'Marcus' }
];

export default function ShopsPage() {
  return <ShopsClient initialShops={shops} />;
}
