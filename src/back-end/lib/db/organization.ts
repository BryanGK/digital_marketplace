import { generateUuid } from 'back-end/lib';
import { Connection, tryDb } from 'back-end/lib/db';
import { createAffiliation, readManyAffiliationsForOrganization } from 'back-end/lib/db/affiliation';
import { readOneFileById } from 'back-end/lib/db/file';
import { readOneUserSlim } from 'back-end/lib/db/user';
import { isAdmin } from 'back-end/lib/permissions';
import { spread, union } from 'lodash';
import CAPABILITIES from 'shared/lib/data/capabilities';
import { valid } from 'shared/lib/http';
import { MembershipStatus, MembershipType } from 'shared/lib/resources/affiliation';
import { FileRecord } from 'shared/lib/resources/file';
import { Organization, OrganizationSlim } from 'shared/lib/resources/organization';
import { Session } from 'shared/lib/resources/session';
import { Id } from 'shared/lib/types';
import { getValidValue, isInvalid } from 'shared/lib/validation';

type CreateOrganizationParams = Partial<Omit<Organization, 'logoImageFile'>> & { logoImageFile?: Id };

interface UpdateOrganizationParams extends Partial<Omit<Organization, 'logoImageFile' | 'owner' | 'possessAllCapabilities' | 'numTeamMembers'>> {
  logoImageFile?: Id;
}

interface RawOrganization extends Omit<Organization, 'logoImageFile' | 'owner' | 'numTeamMembers'> {
  logoImageFile?: Id;
  owner: Id;
  numTeamMembers?: string;
}

interface RawOrganizationSlim extends Omit<OrganizationSlim, 'logoImageFile' | 'owner' | 'numTeamMembers'> {
  logoImageFile?: Id;
  owner?: Id;
  numTeamMembers?: string;
}

async function rawOrganizationToOrganization(connection: Connection, raw: RawOrganization): Promise<Organization> {
  const { logoImageFile, owner: ownerId, numTeamMembers, ...restOfRawOrg } = raw;
  let fetchedLogoFile: FileRecord | undefined;
  if (logoImageFile) {
    const dbResult = await readOneFileById(connection, logoImageFile);
    if (isInvalid(dbResult) || !dbResult.value) {
      throw new Error('unable to process organization');
    }
    fetchedLogoFile = dbResult.value;
  }
  const owner = ownerId ? getValidValue(await readOneUserSlim(connection, ownerId), null) : null;
  return {
    ...restOfRawOrg,
    numTeamMembers: numTeamMembers === undefined ? undefined : parseInt(numTeamMembers, 10),
    logoImageFile: fetchedLogoFile,
    owner: owner || undefined
  };
}

async function rawOrganizationSlimToOrganizationSlim(connection: Connection, raw: RawOrganizationSlim): Promise<OrganizationSlim> {
  const { id, legalName, logoImageFile, owner: ownerId, acceptedSWUTerms, possessAllCapabilities, numTeamMembers } = raw;
  let fetchedLogoImageFile: FileRecord | undefined;
  if (logoImageFile) {
    const dbResult = await readOneFileById(connection, logoImageFile);
    if (isInvalid(dbResult) || !dbResult.value) {
      throw new Error('unable to process organization');
    }
    fetchedLogoImageFile = dbResult.value;
  }
  const owner = ownerId ? getValidValue(await readOneUserSlim(connection, ownerId), null) : null;
  return {
    id,
    legalName,
    logoImageFile: fetchedLogoImageFile,
    owner: owner || undefined,
    acceptedSWUTerms,
    possessAllCapabilities,
    numTeamMembers: numTeamMembers === undefined ? undefined : parseInt(numTeamMembers, 10)
  };
}

async function doesOrganizationMeetAllCapabilities(connection: Connection, organization: RawOrganization | RawOrganizationSlim): Promise<boolean> {
  const dbResult = await readManyAffiliationsForOrganization(connection, organization.id);
  if (isInvalid(dbResult) || !dbResult.value) {
    return false;
  }

  // Need at least two ACTIVE members, all capabilities between members, and accepted terms
  const activeMembers = dbResult.value.filter(a => a.membershipStatus === MembershipStatus.Active);
  const unionedCapabilities = spread<string[]>(union)(activeMembers.map(m => m.user.capabilities));
  if (CAPABILITIES.every(v => unionedCapabilities.includes(v))) {
    return true;
  }
  return false;
}

/**
 * Helper function that returns all organizations with owner id, and an active member count.
 */
function generateOrganizationQuery(connection: Connection) {
  return connection<RawOrganization>('organizations')
    .join('affiliations', 'organizations.id', '=', 'affiliations.organization')
    .join('users', 'users.id', '=', 'affiliations.user')
    .where({ 'affiliations.membershipType': MembershipType.Owner })
    .select(
      'organizations.*',
      'users.id as owner',
      (connection
        .countDistinct('user')
        .from('affiliations')
        .where({ organization: connection.ref('organizations.id') })
        .andWhereNot({ membershipStatus: MembershipStatus.Inactive})
      ).as('numTeamMembers')
    );
}

/**
 * Return a single slimmed-down organization.
 * Only return ownership/RFQ data if admin/owner.
 */
export const readOneOrganizationSlim = tryDb<[Id, boolean?, Session?], OrganizationSlim | null>(async (connection, orgId, allowInactive = false, session) => {
  let query = generateOrganizationQuery(connection).where({ 'organizations.id': orgId });

  if (!allowInactive) {
    query = query.andWhere({ 'organizations.active': true });
  }

  const result = await query.first<RawOrganization>();
  const { id, legalName, logoImageFile, owner, acceptedSWUTerms, numTeamMembers } = result;
  // If no session, or user is not an admin or owner, do not include ownership/RFQ data.
  if (!session || (!isAdmin(session) && owner !== session.user?.id)) {
    return valid(await rawOrganizationSlimToOrganizationSlim(connection, {
      id,
      legalName,
      logoImageFile
    }));
  } else {
    return valid(await rawOrganizationSlimToOrganizationSlim(connection, {
      id,
      legalName,
      logoImageFile,
      owner,
      possessAllCapabilities: await doesOrganizationMeetAllCapabilities(connection, result),
      acceptedSWUTerms,
      numTeamMembers
    }));
  }
});

/**
 * Return a single organization.
 * Only return ownership/RFQ data if admin/owner.
 */
export const readOneOrganization = tryDb<[Id, boolean?, Session?], Organization | null>(async (connection, id, allowInactive = false, session) => {
  let query = generateOrganizationQuery(connection).where({ 'organizations.id': id });

  if (!allowInactive) {
    query = query.andWhere({ 'organizations.active': true });
  }

  const result = await query.first<RawOrganization>();
  if (result) {
    if (!session || (!isAdmin(session) && result.owner !== session.user?.id)) {
      delete result.owner;
      delete result.numTeamMembers;
      delete result.acceptedSWUTerms;
    } else {
      result.possessAllCapabilities = await doesOrganizationMeetAllCapabilities(connection, result);
    }
  }
  return valid(result ? await rawOrganizationToOrganization(connection, result) : null);
});

/**
 * Return all organizations from the database.
 *
 * If the user is:
 *
 * - An admin: Include owner information for all organizations.
 * - A vendor: Include owner information only for owned organizations.
 * - Owner information includes owner id/name, swuQualification status and numTeamMembers
 */
export const readManyOrganizations = tryDb<[Session, boolean?], OrganizationSlim[]>(async (connection, session, allowInactive = false) => {
  let query = generateOrganizationQuery(connection);

  if (!allowInactive) {
    query = query.andWhere({ 'organizations.active': true });
  }

  // Execute query, and the destructure results to only choose 'slim' fields that user has access to
  // Admin/owners get additional fields related to ownership/rfq status
  const results = await query as RawOrganization[] || [];
  return valid(await Promise.all(results.map(async raw => {
    const { id, legalName, logoImageFile, owner, numTeamMembers, acceptedSWUTerms } = raw;
    if (!isAdmin(session) && raw.owner !== session.user?.id) {
      return await rawOrganizationSlimToOrganizationSlim(connection, {
        id,
        legalName,
        logoImageFile
      });
    } else {
      return await rawOrganizationSlimToOrganizationSlim(connection, {
        id,
        legalName,
        logoImageFile,
        owner,
        numTeamMembers,
        possessAllCapabilities: await doesOrganizationMeetAllCapabilities(connection, raw),
        acceptedSWUTerms
      });
    }
  })));
});

export const createOrganization = tryDb<[Id, CreateOrganizationParams, Session], Organization>(async (connection, user, organization, session) => {
  const now = new Date();
  const result: RawOrganization = await connection.transaction(async trx => {
    // Create organization
    const [result] = await connection<CreateOrganizationParams>('organizations')
      .transacting(trx)
      .insert({
        ...organization,
        id: generateUuid(),
        active: true,
        createdAt: now,
        updatedAt: now
      } as CreateOrganizationParams, ['*']);
    if (!result || !user) {
      throw new Error('unable to create organization');
    }
    // Create affiliation
    await createAffiliation(trx, {
      user,
      organization: result.id,
      membershipType: MembershipType.Owner,
      membershipStatus: MembershipStatus.Active
    });
    return result;
  });
  const dbResult = await readOneOrganization(connection, result.id, false, session);
  if (isInvalid(dbResult) || !dbResult.value) {
    throw new Error('unable to create organization');
  }
  return valid(dbResult.value);
});

export const updateOrganization = tryDb<[UpdateOrganizationParams, Session], Organization>(async (connection, organization, session) => {
  const now = new Date();
  const [result] = await connection<UpdateOrganizationParams>('organizations')
    .where({
      id: organization && organization.id,
      active: true
    })
    .update({
      ...organization,
      updatedAt: now
    } as UpdateOrganizationParams, '*');
  if (!result || !result.id) {
    throw new Error('unable to update organization');
  }
  const dbResult = await readOneOrganization(connection, result.id, true, session);
  if (isInvalid(dbResult) || !dbResult.value) {
    throw new Error('unable to update organization');
  }
  return valid(dbResult.value);
});
