import * as crud from 'back-end/lib/crud';
import * as db from 'back-end/lib/db';
import * as permissions from 'back-end/lib/permissions';
import { basicResponse, JsonResponseBody, makeJsonResponseBody, nullRequestBodyHandler, wrapRespond } from 'back-end/lib/server';
import { SupportedRequestBodies, SupportedResponseBodies } from 'back-end/lib/types';
import { validateFileRecord, validateOrganizationId } from 'back-end/lib/validation';
import { get } from 'lodash';
import { getString } from 'shared/lib';
import { CreateRequestBody, CreateValidationErrors, DeleteValidationErrors, Organization, OrganizationSlim, UpdateProfileRequestBody, UpdateRequestBody as SharedUpdateRequestBody, UpdateValidationErrors } from 'shared/lib/resources/organization';
import { Session } from 'shared/lib/resources/session';
import { ADT, adt } from 'shared/lib/types';
import { allValid, getInvalidValue, invalid, isInvalid, isValid, optionalAsync, valid, validateUUID, Validation } from 'shared/lib/validation';
import * as orgValidation from 'shared/lib/validation/organization';

type UpdateRequestBody = SharedUpdateRequestBody | null;

export type ValidatedUpdateRequestBody
  = ADT<'updateProfile', UpdateProfileRequestBody>
  | ADT<'acceptSWUTerms'>;

export type ValidatedCreateRequestBody = CreateRequestBody;

type DeleteValidatedReqBody = Organization;

type Resource = crud.Resource<
  SupportedRequestBodies,
  SupportedResponseBodies,
  CreateRequestBody,
  ValidatedCreateRequestBody,
  CreateValidationErrors,
  null,
  null,
  UpdateRequestBody,
  ValidatedUpdateRequestBody,
  UpdateValidationErrors,
  DeleteValidatedReqBody,
  DeleteValidationErrors,
  Session,
  db.Connection
>;

const resource: Resource = {
  routeNamespace: 'organizations',

  readMany(connection) {
    return nullRequestBodyHandler<JsonResponseBody<OrganizationSlim[] | string[]>, Session>(async request => {
      const respond = (code: number, body: OrganizationSlim[] | string[]) => basicResponse(code, request.session, makeJsonResponseBody(body));
      // Pass session in so we can add owner name, swuQualified status for admin/owner only
      const dbResult = await db.readManyOrganizations(connection, request.session);
      if (isInvalid(dbResult)) {
        return respond(503, [db.ERROR_MESSAGE]);
      }
      return respond(200, dbResult.value);
    });
  },

  readOne(connection) {
    return nullRequestBodyHandler<JsonResponseBody<Organization | string[]>, Session>(async request => {
      const respond = (code: number, body: Organization | string[]) => basicResponse(code, request.session, makeJsonResponseBody(body));
      // Validate the provided id
      const validatedId = validateUUID(request.params.id);
      if (isInvalid(validatedId)) {
        return respond(400, validatedId.value);
      }
      // Only admins or the org owner can read the full org details
      if (await permissions.readOneOrganization(connection, request.session, validatedId.value)) {
        const dbResult = await db.readOneOrganization(connection, validatedId.value, false, request.session);
        if (isInvalid(dbResult)) {
          return respond(503, [db.ERROR_MESSAGE]);
        }
        if (!dbResult.value) {
          return respond(404, ['Organization not found.']);
        }
        return respond(200, dbResult.value);
      } else {
        return respond(401, [permissions.ERROR_MESSAGE]);
      }
    });
  },

  create(connection) {
    return {
      async parseRequestBody(request) {
        const body = request.body.tag === 'json' ? request.body.value : {};
        return {
          legalName: getString(body, 'legalName'),
          logoImageFile: getString(body, 'logoImageFile') || undefined,
          websiteUrl: getString(body, 'websiteUrl'),
          streetAddress1: getString(body, 'streetAddress1'),
          streetAddress2: getString(body, 'streetAddress2'),
          city: getString(body, 'city'),
          region: getString(body, 'region'),
          mailCode: getString(body, 'mailCode'),
          country: getString(body, 'country'),
          contactName: getString(body, 'contactName'),
          contactTitle: getString(body, 'contactTitle'),
          contactEmail: getString(body, 'contactEmail'),
          contactPhone: getString(body, 'contactPhone')
        };
      },
      async validateRequestBody(request) {
        const { legalName,
                logoImageFile,
                websiteUrl,
                streetAddress1,
                streetAddress2,
                city,
                region,
                mailCode,
                country,
                contactName,
                contactTitle,
                contactEmail,
                contactPhone } = request.body;

        const validatedLegalName = orgValidation.validateLegalName(legalName);
        const validatedLogoImageFile = await optionalAsync(logoImageFile, v => validateFileRecord(connection, v));
        const validatedWebsiteUrl = orgValidation.validateWebsiteUrl(websiteUrl);
        const validatedStreetAddress1 = orgValidation.validateStreetAddress1(streetAddress1);
        const validatedStreetAddress2 = orgValidation.validateStreetAddress2(streetAddress2);
        const validatedCity = orgValidation.validateCity(city);
        const validatedRegion = orgValidation.validateRegion(region);
        const validatedMailCode = orgValidation.validateMailCode(mailCode);
        const validatedCountry = orgValidation.validateCountry(country);
        const validatedContactName = orgValidation.validateContactName(contactName);
        const validatedContactTitle = orgValidation.validateContactTitle(contactTitle);
        const validatedContactEmail = orgValidation.validateContactEmail(contactEmail);
        const validatedContactPhone = orgValidation.validateContactPhone(contactPhone);

        if (allValid([validatedLegalName,
                      validatedLogoImageFile,
                      validatedWebsiteUrl,
                      validatedStreetAddress1,
                      validatedStreetAddress2,
                      validatedCity,
                      validatedRegion,
                      validatedMailCode,
                      validatedCountry,
                      validatedContactName,
                      validatedContactTitle,
                      validatedContactEmail,
                      validatedContactPhone
                    ])) {
                      if (!permissions.createOrganization(request.session) || !request.session.user) {
                        return invalid({
                          permissions: [permissions.ERROR_MESSAGE]
                        });
                      }
                      return valid({
                        legalName: validatedLegalName.value,
                        logoImageFile: isValid(validatedLogoImageFile) && validatedLogoImageFile.value && validatedLogoImageFile.value.id,
                        websiteUrl: validatedWebsiteUrl.value,
                        streetAddress1: validatedStreetAddress1.value,
                        streetAddress2: validatedStreetAddress2.value,
                        city: validatedCity.value,
                        region: validatedRegion.value,
                        mailCode: validatedMailCode.value,
                        country: validatedCountry.value,
                        contactName: validatedContactName.value,
                        contactTitle: validatedContactTitle.value,
                        contactEmail: validatedContactEmail.value,
                        contactPhone: validatedContactPhone.value
                      } as ValidatedCreateRequestBody);
                    } else {
                      return invalid({
                        legalName: getInvalidValue(validatedLegalName, undefined),
                        logoImageFile: getInvalidValue(validatedLogoImageFile, undefined),
                        websiteUrl: getInvalidValue(validatedWebsiteUrl, undefined),
                        contactName: getInvalidValue(validatedContactName, undefined),
                        contactTitle: getInvalidValue(validatedContactTitle, undefined),
                        contactEmail: getInvalidValue(validatedContactEmail, undefined),
                        contactPhone: getInvalidValue(validatedContactPhone, undefined),
                        streetAddress1: getInvalidValue(validatedStreetAddress1, undefined),
                        streetAddress2: getInvalidValue(validatedStreetAddress2, undefined),
                        city: getInvalidValue(validatedCity, undefined),
                        region: getInvalidValue(validatedRegion, undefined),
                        mailCode: getInvalidValue(validatedMailCode, undefined),
                        country: getInvalidValue(validatedCountry, undefined)
                      });
                    }
      },
      respond: wrapRespond<CreateRequestBody, CreateValidationErrors, JsonResponseBody<Organization>, JsonResponseBody<CreateValidationErrors>, Session>({
        valid: (async request => {
          if (!request.session.user) {
            return basicResponse(401, request.session, makeJsonResponseBody({ permissions: [permissions.ERROR_MESSAGE]}));
          }
          const dbResult = await db.createOrganization(connection, request.session.user.id, request.body, request.session);
          if (isInvalid(dbResult)) {
            return basicResponse(503, request.session, makeJsonResponseBody({ database: [db.ERROR_MESSAGE] }));
          }
          return basicResponse(201, request.session, makeJsonResponseBody(dbResult.value));
        }),
        invalid: (async request => {
          return basicResponse(400, request.session, makeJsonResponseBody(request.body));
        })
      })
    };
  },

  update(connection) {
    return {
      async parseRequestBody(request): Promise<UpdateRequestBody> {
        const body = request.body.tag === 'json' ? request.body.value : {};
        const tag = getString(body, 'tag');
        const value: unknown = get(body, 'value');
        switch (tag) {
          case 'updateProfile':
            return adt('updateProfile', {
              legalName: getString(value, 'legalName'),
              logoImageFile: getString(value, 'logoImageFile'),
              websiteUrl: getString(value, 'websiteUrl'),
              streetAddress1: getString(value, 'streetAddress1'),
              streetAddress2: getString(value, 'streetAddress2'),
              city: getString(value, 'city'),
              region: getString(value, 'region'),
              mailCode: getString(value, 'mailCode'),
              country: getString(value, 'country'),
              contactName: getString(value, 'contactName'),
              contactTitle: getString(value, 'contactTitle'),
              contactEmail: getString(value, 'contactEmail'),
              contactPhone: getString(value, 'contactString')
            });
          case 'acceptSWUTerms':
            return adt('acceptSWUTerms');
          default:
            return null;
        }
      },
      async validateRequestBody(request): Promise<Validation<ValidatedUpdateRequestBody, UpdateValidationErrors>> {
        if (!request.body) { return invalid({ organization: adt('parseFailure' as const)}); }
        if (!await permissions.updateOrganization(connection, request.session, request.params.id)) {
          return invalid({
            permissions: [permissions.ERROR_MESSAGE]
          });
        }
        const validatedOrganization = await validateOrganizationId(connection, request.params.id, request.session);
        switch (request.body.tag) {
          case 'updateProfile':
            const {
              legalName,
              logoImageFile,
              websiteUrl,
              streetAddress1,
              streetAddress2,
              city,
              region,
              mailCode,
              country,
              contactName,
              contactTitle,
              contactEmail,
              contactPhone } = request.body.value;

            const validatedLegalName = orgValidation.validateLegalName(legalName);
            const validatedLogoImageFile = await optionalAsync(logoImageFile, v => validateFileRecord(connection, v));
            const validatedWebsiteUrl = orgValidation.validateWebsiteUrl(websiteUrl);
            const validatedStreetAddress1 = orgValidation.validateStreetAddress1(streetAddress1);
            const validatedStreetAddress2 = orgValidation.validateStreetAddress2(streetAddress2);
            const validatedCity = orgValidation.validateCity(city);
            const validatedRegion = orgValidation.validateRegion(region);
            const validatedMailCode = orgValidation.validateMailCode(mailCode);
            const validatedCountry = orgValidation.validateCountry(country);
            const validatedContactName = orgValidation.validateContactName(contactName);
            const validatedContactTitle = orgValidation.validateContactTitle(contactTitle);
            const validatedContactEmail = orgValidation.validateContactEmail(contactEmail);
            const validatedContactPhone = orgValidation.validateContactPhone(contactPhone);

            if (allValid([
              validatedOrganization,
              validatedLegalName,
              validatedLogoImageFile,
              validatedWebsiteUrl,
              validatedStreetAddress1,
              validatedStreetAddress2,
              validatedCity,
              validatedRegion,
              validatedMailCode,
              validatedCountry,
              validatedContactName,
              validatedContactTitle,
              validatedContactEmail,
              validatedContactPhone
            ])) {
              return valid(adt('updateProfile', {
                id: (validatedOrganization.value as Organization).id,
                legalName: validatedLegalName.value,
                logoImageFile: isValid(validatedLogoImageFile) && validatedLogoImageFile.value && validatedLogoImageFile.value.id,
                websiteUrl: validatedWebsiteUrl.value,
                streetAddress1: validatedStreetAddress1.value,
                streetAddress2: validatedStreetAddress2.value,
                city: validatedCity.value,
                region: validatedRegion.value,
                mailCode: validatedMailCode.value,
                country: validatedCountry.value,
                contactName: validatedContactName.value,
                contactTitle: validatedContactTitle.value,
                contactEmail: validatedContactEmail.value,
                contactPhone: validatedContactPhone.value
              } as UpdateProfileRequestBody));
            } else {
              return invalid({
                organization: adt('updateProfile' as const, {
                  id: getInvalidValue(validatedOrganization, undefined),
                  legalName: getInvalidValue(validatedLegalName, undefined),
                  logoImageFile: getInvalidValue(validatedLogoImageFile, undefined),
                  websiteUrl: getInvalidValue(validatedWebsiteUrl, undefined),
                  contactName: getInvalidValue(validatedContactName, undefined),
                  contactTitle: getInvalidValue(validatedContactTitle, undefined),
                  contactEmail: getInvalidValue(validatedContactEmail, undefined),
                  contactPhone: getInvalidValue(validatedContactPhone, undefined),
                  streetAddress1: getInvalidValue(validatedStreetAddress1, undefined),
                  streetAddress2: getInvalidValue(validatedStreetAddress2, undefined),
                  city: getInvalidValue(validatedCity, undefined),
                  region: getInvalidValue(validatedRegion, undefined),
                  mailCode: getInvalidValue(validatedMailCode, undefined),
                  country: getInvalidValue(validatedCountry, undefined)
                })
              });
            }
          case 'acceptSWUTerms':
            if (isValid(validatedOrganization)) {
              if (validatedOrganization.value.acceptedSWUTerms) {
                return invalid({ organization: adt('acceptSWUTerms' as const, ['The SWU Terms have already been accepted for this organization.'])});
              }
              return valid(adt('acceptSWUTerms' as const));
            }
          default:
            return invalid({ organization: adt('parseFailure' as const) });
        }
      },
      respond: wrapRespond({
        valid: (async request => {
          let dbResult: Validation<Organization, null>;
          switch (request.body.tag) {
            case 'updateProfile':
              dbResult = await db.updateOrganization(connection, request.body.value, request.session);
              break;
            case 'acceptSWUTerms':
              dbResult = await db.updateOrganization(connection, { acceptedSWUTerms: new Date(), id: request.params.id }, request.session);
          }
          if (isInvalid(dbResult)) {
            return basicResponse(503, request.session, makeJsonResponseBody({ database: [db.ERROR_MESSAGE] }));
          }
          return basicResponse(200, request.session, makeJsonResponseBody(dbResult.value));
        }),
        invalid: (async request => {
          return basicResponse(400, request.session, makeJsonResponseBody(request.body));
        })
      })
    };
  },

  delete(connection) {
    return {
      async validateRequestBody(request): Promise<Validation<DeleteValidatedReqBody, DeleteValidationErrors>> {
        if (!(await permissions.deleteOrganization(connection, request.session, request.params.id))) {
          return invalid({
            permissions: [permissions.ERROR_MESSAGE]
          });
        }
        const validatedOrganization = await validateOrganizationId(connection, request.params.id, request.session);
        if (isValid(validatedOrganization)) {
          return validatedOrganization;
        } else {
          return invalid({ notFound: ['Organization not found.']});
        }
      },
      respond: wrapRespond({
        valid: (async request => {
        // Mark the organization as inactive
          const dbResult = await db.updateOrganization(connection, {
            id: request.params.id,
            active: false,
            deactivatedOn: new Date(),
            deactivatedBy: request.session.user && request.session.user.id
          },
          request.session);
          if (isInvalid(dbResult)) {
            return basicResponse(503, request.session, makeJsonResponseBody({ database: [db.ERROR_MESSAGE] }));
          }
          return basicResponse(200, request.session, makeJsonResponseBody(dbResult.value));
        }),
        invalid: (async request => {
          return basicResponse(400, request.session, makeJsonResponseBody(request.body));
        })
      })
    };
  }
};

export default resource;
