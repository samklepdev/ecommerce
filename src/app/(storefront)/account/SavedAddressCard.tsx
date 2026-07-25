'use client';

import { useState } from 'react';

import { deleteSavedAddressAction, setDefaultSavedAddressAction } from '@/app/actions/addresses';
import { EditSavedAddressForm } from './EditSavedAddressForm';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TrashIcon } from '@/components/ui/TrashIcon';
import styles from './page.module.css';

export interface SavedAddressCardProps {
  id: string;
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export function SavedAddressCard({
  id,
  name,
  line1,
  line2,
  city,
  region,
  postalCode,
  country,
  isDefault,
}: SavedAddressCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <Card className={styles.addressCard}>
        <EditSavedAddressForm
          id={id}
          initial={{ name, line1, line2, city, region, postalCode, country }}
          onCancel={() => setIsEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card className={styles.addressCard}>
      <div>
        <p className={styles.addressName}>
          {name} {isDefault && <Badge tone="accent">Default</Badge>}
        </p>
        <p className={styles.meta}>
          {line1}
          {line2 ? `, ${line2}` : ''}, {city}, {region} {postalCode}, {country}
        </p>
      </div>
      <div className={styles.addressActions}>
        <Button type="button" variant="ghost" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
        {!isDefault && (
          <form action={setDefaultSavedAddressAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="ghost">
              Set default
            </Button>
          </form>
        )}
        <form action={deleteSavedAddressAction}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="ghost" iconOnly aria-label="Delete address">
            <TrashIcon />
          </Button>
        </form>
      </div>
    </Card>
  );
}
