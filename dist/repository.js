import { validateApplication } from './applications.js';

// RLS authorizes requests. Explicit owner filters add clarity, not a security boundary.
export function createRepository(client, pageSize = 500) {
  function requireUser(userId) {
    if (!userId) throw Error('Please sign in again.');
  }
  async function changed(query) {
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length)
      throw Error('This application is unavailable. Refresh the list and try again.');
    return data[0];
  }
  return {
    async list(userId) {
      requireUser(userId);
      const records = [];
      // Batch requests avoid silently losing records at the API's default row limit.
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await client
          .from('applications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!Array.isArray(data)) throw Error('The server returned an invalid application list.');
        records.push(...data);
        if (data.length < pageSize) return records;
      }
    },
    async save(userId, input, id = '') {
      requireUser(userId);
      const payload = validateApplication(input);
      const query = id
        ? client.from('applications').update(payload).eq('id', id).eq('user_id', userId)
        : client.from('applications').insert({ ...payload, user_id: userId });
      return changed(query.select('*'));
    },
    async remove(userId, id) {
      requireUser(userId);
      return changed(
        client.from('applications').delete().eq('id', id).eq('user_id', userId).select('id'),
      );
    },
    async completeFollowUp(userId, id) {
      requireUser(userId);
      return changed(
        client
          .from('applications')
          .update({ follow_up: null })
          .eq('id', id)
          .eq('user_id', userId)
          .select('*'),
      );
    },
  };
}
