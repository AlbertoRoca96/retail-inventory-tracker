import { uploadPhotosAndGetUrls } from '../../src/lib/supabaseHelpers';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth'; // or wherever your auth context is

// inside component:
const { session } = useAuth(); // session?.user.id is the uid

async function onSubmit() {
  try {
    setBanner({ kind: 'info', text: 'Submitting…' });

    const uid =
      session?.user?.id || 'dev-user'; // keep your bypass working

    // 1) Upload photos (if any)
    const photoUrls = await uploadPhotosAndGetUrls(uid, photos /* your state */);

    // 2) Insert submission row
    const { error } = await supabase.from('submissions').insert({
      user_id: uid,
      status: 'submitted',
      date,
      store_location,
      conditions,
      price_per_unit: pricePerUnit ? Number(pricePerUnit) : null,
      shelf_space,
      on_shelf,
      tags,
      notes,
      photo1_url: photoUrls[0] ?? null,
      photo2_url: photoUrls[1] ?? null,
    });

    if (error) throw error;

    setBanner({ kind: 'success', text: 'Submission Successful' });
    setDirty(false);
    // optionally: router.replace('/submissions') or clear form
  } catch (e: any) {
    console.error(e);
    setBanner({ kind: 'error', text: e?.message ?? 'Upload failed' });
  }
}
