'use strict';

var Resource = require('dw/web/Resource');
var sfscRestService = require('*/cartridge/scripts/services/sfscRestService.js');
var sfscConstants = require('*/cartridge/scripts/utils/sfscConstants').getConstants();

function createAccount(orgName, phoneNumber) {
    try {
        var accountData = {
            'Name': orgName,
            'Phone': phoneNumber
        };

        // Set up the SFSC REST request data
        var data = {
            path: sfscConstants.SOBJECT_SERVICE_ENDPOINT + '/Account',
            method: sfscConstants.HTTP_METHOD_POST,
            data: JSON.stringify(accountData)
        };

        // Call the SFSC REST API to create the account
        var sfscServiceResponse = sfscRestService.call(data);

        if (sfscServiceResponse == null) {
            throw new Error(Resource.msg('error.sfsc.noresponse', 'b2berrors', null));
        }

        if (sfscServiceResponse.statusMessage == 'OK' && sfscServiceResponse.statusCode == 201) {
            return sfscServiceResponse;
        } else {
            throw new Error(Resource.msg('error.sfsc.createaccount', 'b2berrors', null));
        }
    } catch (e) {
        throw new Error(Resource.msg('error.sfsc.createaccount', 'b2berrors', null));
    }
}

exports.createAccount = createAccount;
