'use strict';

var server = require('server');


server.extend(module.superModule);

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var googleCaptchaUtil = require('*/cartridge/scripts/googleRecaptchaUtil');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');
var Logger = require('dw/system/Logger');
var s2kLogger = Logger.getLogger('S2K', 'S2K_General');
var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
var MessageConstants = require('*/cartridge/scripts/utils/cdwConstants').getConstants();
var b2bUtils = require('*/cartridge/scripts/helpers/b2bUtils');
var validationHelper = require('*/cartridge/scripts/helpers/validationHelper');
var messageHelper = require('~/cartridge/scripts/helpers/messageHelper');
var productListHelper = require('*/cartridge/scripts/productList/productListHelpers');
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');
var googeReCaptchaKey = Site.getCurrent().getCustomPreferenceValue('googeReCaptchaKey');
var isGoogleRecaptchaEnabled = Site.getCurrent().getCustomPreferenceValue('isGoogleRecaptchaEnabled');

/**
 * Account-SubmitRegistration : The Account-SubmitRegistration endpoint is the endpoint that gets hit when a shopper submits their registration for a new account
 * @name Base/Account-SubmitRegistration
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {querystringparameter} - rurl - redirect url. The value of this is a number. This number then gets mapped to an endpoint set up in oAuthRenentryRedirectEndpoints.js
 * @param {httpparameter} - dwfrm_profile_customer_firstname - Input field for the shoppers's first name
 * @param {httpparameter} - dwfrm_profile_customer_lastname - Input field for the shopper's last name
 * @param {httpparameter} - dwfrm_profile_customer_phone - Input field for the shopper's phone number
 * @param {httpparameter} - dwfrm_profile_customer_email - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_customer_emailconfirm - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_login_password - Input field for the shopper's password
 * @param {httpparameter} - dwfrm_profile_login_passwordconfirm: - Input field for the shopper's password to confirm
 * @param {httpparameter} - dwfrm_profile_customer_addtoemaillist - Checkbox for whether or not a shopper wants to be added to the mailing list
 * @param {httpparameter} - csrf_token - hidden input field CSRF token
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 */
 server.replace(
    'SubmitRegistration',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {

        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Resource = require('dw/web/Resource');
        var formErrors = require('*/cartridge/scripts/formErrors');

        /** Wishlist PrePend Management START */
        var viewData = res.getViewData();
        var list = productListHelper.getList(req.currentCustomer.raw, { type: 10 });
        viewData.list = list;
        res.setViewData(viewData);
        /** Wishlist PrePend Management END */

        var registrationForm = server.forms.getForm('profile');
        if(isGoogleRecaptchaEnabled && !empty(googeReCaptchaKey))
        {
            if(request.getHttpParameterMap().get("g-recaptcha-response").value === undefined || 
                    request.getHttpParameterMap().get("g-recaptcha-response").value === '' || 
                    request.getHttpParameterMap().get("g-recaptcha-response").value === null) {
                        //Return Error
                        res.json({"success": false, "errorField" : "reCaptcha","message" : Resource.msg('g.recaptcha.error.message', 'forms', null)});
                        return next();
            } else {
                    var googleCaptchaResult = googleCaptchaUtil.validateToken(request.getHttpParameterMap().get("g-recaptcha-response").value);
                    if(!googleCaptchaResult.success) {
                        res.json({"success": false, "errorField" : "reCaptcha","message" : Resource.msg('g.recaptcha.error.message', 'forms', null)});
                        return next();
                    }
            }
        }
        if (registrationForm.login.password.value
            !== registrationForm.login.passwordconfirm.value
        ) {
            registrationForm.login.password.valid = false;
            registrationForm.login.passwordconfirm.valid = false;
            registrationForm.login.passwordconfirm.error =
                Resource.msg('error.message.mismatch.password', 'forms', null);
            registrationForm.valid = false;
        }

        if (!CustomerMgr.isAcceptablePassword(registrationForm.login.password.value)) {
            registrationForm.login.password.valid = false;
            registrationForm.login.password.error =
                Resource.msg('error.message.password.constraints.not.matched', 'forms', null);
            registrationForm.valid = false;
        }

            // form validation
        if (!validationHelper.valdateEmailId(registrationForm.customer.email.value.toLowerCase())) {
            registrationForm.customer.email.valid = false;
            registrationForm.customer.email.error =
                Resource.msg('error.message.invalid.email', 'forms', null);
            registrationForm.valid = false;
        }

        // setting variables for the BeforeComplete function
        var registrationFormObj = {
            firstName: registrationForm.customer.firstname.value,
            lastName: registrationForm.customer.lastname.value,
            phone: registrationForm.customer.phone.value,
            email: registrationForm.customer.email.value,
            //emailConfirm: registrationForm.customer.emailconfirm.value,
            logonId: registrationForm.customer.logonId.value,
            addToEmailList: registrationForm.customer.addtoemaillist.value,
            password: registrationForm.login.password.value,
            passwordConfirm: registrationForm.login.passwordconfirm.value,
            validForm: registrationForm.valid,
            form: registrationForm
        };

        if (registrationForm.valid) {
            res.setViewData(registrationFormObj);

            this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
                var Transaction = require('dw/system/Transaction');
                var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');
                var authenticatedCustomer;
                var serverError;

                // getting variables for the BeforeComplete function
                var registrationForm = res.getViewData(); // eslint-disable-line

                if (registrationForm.validForm) {
                    var login = registrationForm.logonId;
                    var password = registrationForm.password;

                    // attempt to create a new user and log that user in.
                    try {
                        Transaction.wrap(function () {
                            var error = {};
                            var newCustomer = CustomerMgr.createCustomer(login, password);

                            var authenticateCustomerResult = CustomerMgr.authenticateCustomer(login, password);
                            if (authenticateCustomerResult.status !== 'AUTH_OK') {
                                error = { authError: true, status: authenticateCustomerResult.status };
                                throw error;
                            }

                            authenticatedCustomer = CustomerMgr.loginCustomer(authenticateCustomerResult, false);

                            if (!authenticatedCustomer) {
                                error = { authError: true, status: authenticateCustomerResult.status };
                                throw error;
                            } else {
                                // assign values to the profile
                                var newCustomerProfile = newCustomer.getProfile();

                                newCustomerProfile.firstName = registrationForm.firstName;
                                newCustomerProfile.lastName = registrationForm.lastName;
                                newCustomerProfile.phoneHome = registrationForm.phone;
                                newCustomerProfile.email = registrationForm.email;
                            }
                        });
                    } catch (e) {
                        if (e.authError) {
                            serverError = true;
                        } else {
                            registrationForm.validForm = false;
                            registrationForm.form.customer.logonId.valid = false;
                            //registrationForm.form.customer.emailconfirm.valid = false;
                            registrationForm.form.customer.logonId.error =
                                Resource.msg('error.message.username.invalid', 'forms', null);
                        }
                    }
                }

                delete registrationForm.password;
                delete registrationForm.passwordConfirm;
                formErrors.removeFormValues(registrationForm.form);

                if (serverError) {
                    res.setStatusCode(500);
                    res.json({
                        success: false,
                        errorMessage: Resource.msg('error.message.unable.to.create.account', 'login', null)
                    });

                    return;
                }

                if (registrationForm.validForm) {

                    //Send Newsletter Entry message now
                    messageHelper.handleNewsletterSignup(registrationForm.addToEmailList,request.geolocation.postalCode,registrationForm.email);

                    // send a registration email
                    accountHelpers.sendCreateAccountEmail(authenticatedCustomer.profile);

                    res.setViewData({ authenticatedCustomer: authenticatedCustomer });
                    res.json({
                        success: true,
                        redirectUrl: accountHelpers.getLoginRedirectURL(req.querystring.rurl, req.session.privacyCache, true)
                    });

                    req.session.privacyCache.set('args', null);
                } else {
                    res.json({
                        fields: formErrors.getFormErrors(registrationForm)
                    });
                }

                /**WishList Append Management START */
                var viewData = res.getViewData();
                var listGuest = viewData.list;
                if (viewData.authenticatedCustomer) {
                    var listLoggedIn = productListHelper.getCurrentOrNewList(viewData.authenticatedCustomer, { type: 10 });
                    productListHelper.mergelists(listLoggedIn, listGuest, req, { type: 10 });
                }
                /**WishList Append Management END */
            });
        } else {
            res.json({
                fields: formErrors.getFormErrors(registrationForm)
            });
        }

        return next();
    }
);

/**
 * Account-EditProfile : The Account-EditProfile endpoint renders the page that allows a shopper to edit their profile. The edit profile form is prefilled with the shopper's first name, last name, phone number and email
 * @name Base/Account-EditProfile
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.generateToken
 * @param {middleware} - userLoggedIn.validateLoggedIn
 * @param {middleware} - consentTracking.consent
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
 server.append(
    'EditProfile',
    server.middleware.https,
    csrfProtection.generateToken,
    userLoggedIn.validateLoggedIn,
    consentTracking.consent,
    function (req, res, next) {
        var viewData = res.getViewData();
        var credentialsObj = customer.getProfile().getCredentials();
        viewData.profileForm.customer.logonId.value = credentialsObj.login;

        var breadcrumbs= [
            {
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString()
            },
            {
                htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                url: URLUtils.url('Account-Show').toString()
            },
            {
                htmlValue: Resource.msg('page.title.edit.profile', 'account', null),
                url: URLUtils.url('Account-Show').toString()
            }
        ];
        res.setViewData({
            breadcrumbs: breadcrumbs
        });
        var computedMetaData = {
            title: Resource.msg('account.page.profile.description', 'account', null), 
            description: Resource.msg('account.page.profile.description', 'account', null),
            keywords: Resource.msg('account.page.profile.description', 'account', null),
            pageMetaTags: []
        };
        var pageGroup = {name: Resource.msg('account.page.pageGroup.name', 'account', null),
                        ID: Resource.msg('account.page.pageGroup.name', 'account', null),
                        content: Resource.msg('account.page.profile.pageGroup.value', 'account', null)};
        var robots = {name: Resource.msg('account.page.robots.name', 'account', null),
                        ID: Resource.msg('account.page.robots.name', 'account', null),
                        content: Resource.msg('account.page.robots.value', 'account', null)};                    
        computedMetaData.pageMetaTags.push(pageGroup);
        computedMetaData.pageMetaTags.push(robots);

        res.setViewData({
            CurrentPageMetaData: computedMetaData
        });

        next();
    }
);

/**
 * Account-EditPassword : The Account-EditPassword endpoint renders thes edit password pages. This page allows the shopper to change their password for their account
 * @name Base/Account-EditPassword
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.generateToken
 * @param {middleware} - userLoggedIn.validateLoggedIn
 * @param {middleware} - consentTracking.consent
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
 server.append(
    'EditPassword',
    server.middleware.https,
    csrfProtection.generateToken,
    userLoggedIn.validateLoggedIn,
    consentTracking.consent,
    function (req, res, next) {
        res.setViewData({
            breadcrumbs: [
                {
                    htmlValue: Resource.msg('global.home', 'common', null),
                    url: URLUtils.home().toString()
                },
                {
                    htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                    url: URLUtils.url('Account-Show').toString()
                },
                {
                    htmlValue: Resource.msg('page.title.edit.password', 'account', null),
                    url: URLUtils.url('Account-Show').toString()
                }
            ]
        });
        var computedMetaData = {
            title: Resource.msg('account.page.edit.password.description', 'account', null), 
            description: Resource.msg('account.page.edit.password.description', 'account', null),
            keywords: Resource.msg('account.page.edit.password.description', 'account', null),
            pageMetaTags: []
        };
        var pageGroup = {name: Resource.msg('account.page.pageGroup.name', 'account', null),
                        ID: Resource.msg('account.page.pageGroup.name', 'account', null),
                        content: Resource.msg('account.page.edit.password.pageGroup.value', 'account', null)};
        var robots = {name: Resource.msg('account.page.robots.name', 'account', null),
                        ID: Resource.msg('account.page.robots.name', 'account', null),
                        content: Resource.msg('account.page.robots.value', 'account', null)};                    
        computedMetaData.pageMetaTags.push(pageGroup);
        computedMetaData.pageMetaTags.push(robots);

        res.setViewData({
            CurrentPageMetaData: computedMetaData
        });
        next();
    }
);


/**
 * Account-SaveProfile : The Account-SaveProfile endpoint is the endpoint that gets hit when a shopper has edited their profile
 * @name Base/Account-SaveProfile
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {httpparameter} - dwfrm_profile_customer_firstname - Input field for the shoppers's first name
 * @param {httpparameter} - dwfrm_profile_customer_lastname - Input field for the shopper's last name
 * @param {httpparameter} - dwfrm_profile_customer_phone - Input field for the shopper's phone number
 * @param {httpparameter} - dwfrm_profile_customer_email - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_customer_emailconfirm - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_login_password  - Input field for the shopper's password
 * @param {httpparameter} - csrf_token - hidden input field CSRF token
 * @param {category} - sensititve
 * @param {returns} - json
 * @param {serverfunction} - post
 */
 server.replace(
    'SaveProfile',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var Transaction = require('dw/system/Transaction');
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Resource = require('dw/web/Resource');
        var URLUtils = require('dw/web/URLUtils');
        var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');

        var formErrors = require('*/cartridge/scripts/formErrors');

        var profileForm = server.forms.getForm('profile');

        // form validation
        // if (profileForm.customer.email.value.toLowerCase()
        //     !== profileForm.customer.emailconfirm.value.toLowerCase()) {
        //     profileForm.valid = false;
        //     profileForm.customer.email.valid = false;
        //     profileForm.customer.emailconfirm.valid = false;
        //     profileForm.customer.emailconfirm.error =
        //         Resource.msg('error.message.mismatch.email', 'forms', null);
        // }

        // form validation
        if (!validationHelper.valdateEmailId(profileForm.customer.email.value.toLowerCase())) {
            profileForm.customer.email.valid = false;
            profileForm.customer.email.error =
                Resource.msg('error.message.invalid.email', 'forms', null);
            profileForm.valid = false;
        }

        var result = {
            firstName: profileForm.customer.firstname.value,
            lastName: profileForm.customer.lastname.value,
            phone: profileForm.customer.phone.value,
            email: profileForm.customer.email.value,
            //confirmEmail: profileForm.customer.emailconfirm.value,
            addToEmailList: profileForm.customer.addtoemaillist.value,
            logonId: profileForm.customer.logonId.value,
            password: profileForm.login.password.value,
            profileForm: profileForm
        };
        if (profileForm.valid) {
            res.setViewData(result);
            this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
                var formInfo = res.getViewData();
                var customer = CustomerMgr.getCustomerByCustomerNumber(
                    req.currentCustomer.profile.customerNo
                );
                var profile = customer.getProfile();
                var customerLogin;
                var status;

                Transaction.wrap(function () {
                    status = profile.credentials.setPassword(
                        formInfo.password,
                        formInfo.password,
                        true
                    );

                    if (status.error) {
                        formInfo.profileForm.login.password.valid = false;
                        formInfo.profileForm.login.password.error =
                            Resource.msg('error.message.currentpasswordnomatch', 'forms', null);
                    } else {
                        customerLogin = profile.credentials.setLogin(
                            formInfo.logonId,
                            formInfo.password
                        );
                    }
                });

                delete formInfo.password;
                delete formInfo.confirmEmail;

                if (customerLogin) {
                    Transaction.wrap(function () {
                        profile.setFirstName(formInfo.firstName);
                        profile.setLastName(formInfo.lastName);
                        profile.setEmail(formInfo.email);
                        profile.setPhoneHome(formInfo.phone);
                    });

                    //Send Newsletter Entry message now
                    messageHelper.handleNewsletterSignup(formInfo.addToEmailList,request.geolocation.postalCode,formInfo.email);
                    
                    // Send account edited email
                    accountHelpers.sendAccountEditedEmail(customer.profile);

                    delete formInfo.profileForm;
                    delete formInfo.email;

                    res.json({
                        success: true,
                        redirectUrl: URLUtils.url('Account-Show').toString()
                    });
                } else {
                    if (!status.error) {
                        formInfo.profileForm.customer.email.valid = false;
                        formInfo.profileForm.customer.email.error =
                            Resource.msg('error.message.username.invalid', 'forms', null);
                    }

                    delete formInfo.profileForm;
                    delete formInfo.email;
                    delete formInfo.logonId;

                    res.json({
                        success: false,
                        fields: formErrors.getFormErrors(profileForm)
                    });
                }
            });
        } else {
            res.json({
                success: false,
                fields: formErrors.getFormErrors(profileForm)
            });
        }
        return next();
    }
);

/**
 * Account-PasswordResetDialogForm : The Account-PasswordResetDialogForm endpoint is the endpoint that gets hit once the shopper has clicked forgot password and has submitted their email address to request to reset their password
 * @name Base/Account-PasswordResetDialogForm
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {querystringparameter} - mobile - a flag determining whether or not the shopper is on a mobile sized screen
 * @param {httpparameter} - loginEmail - Input field, the shopper's email address
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 */
 server.replace('PasswordResetDialogForm', csrfProtection.validateAjaxRequest, server.middleware.https, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');

    var logonId = req.form.logonId;
    var errorMsg;
    var isValid;
    var resettingCustomer;
    var mobile = req.querystring.mobile;
    var receivedMsgHeading = Resource.msg('label.resetpasswordreceived', 'login', null);
    var receivedMsgBody = Resource.msg('msg.requestedpasswordreset', 'login', null);
    var buttonText = Resource.msg('button.text.loginform', 'login', null);
    var returnUrl = URLUtils.url('Login-Show').toString();
    if (logonId) {
        // retrieve the user by logon ID
        resettingCustomer = CustomerMgr.getCustomerByLogin(logonId);
        // if the user cannot be found, it will return null, in which we throw error message
        if (resettingCustomer != null ) {
            // retrieve the email from the profile and use it for sending email
            var email = resettingCustomer.profile.email;

            if (resettingCustomer) {
                accountHelpers.sendPasswordResetEmail(email, resettingCustomer);
            }
            res.json({
                success: true,
                receivedMsgHeading: receivedMsgHeading,
                receivedMsgBody: receivedMsgBody,
                buttonText: buttonText,
                mobile: mobile,
                returnUrl: returnUrl
            });
        } else {
            // invalid logon Id condition
            errorMsg = Resource.msg('error.message.passwordreset', 'account', null);
            res.json({
                fields: {
                    logonId: errorMsg
                }
            });
        }
    } else {
        // display the error message if no value is entered in the field
        errorMsg = Resource.msg('error.message.required', 'login', null);
        res.json({
            fields: {
                logonId: errorMsg
            }
        });
    }
    next();
});

/**
 * Route to handle the B2B Account Validation
 *  - get the account number and call the  S2K API
 *  - On Successful validation, render the B2BAccount Registraiton Template
 */
server.post(
    'B2BAccountValidation',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var Resource = require('dw/web/Resource');
 
        var locateAccountForm = req.form;
        var accountNumber = locateAccountForm.accountNumber;
        var zipCode = locateAccountForm.zipCode;
    
        if (accountNumber !== "" && zipCode !== "") {
            // validate that the B2BOrganizaation for the account number does not already exist
            if (b2bUtils.b2bOrganizationExists(accountNumber)) {
                res.json({
                    success: false,
                    errorMessage: Resource.msg('b2b.errors.account.exists', 'b2berrors', null) 
                });
            } else {
                // retrieve the account details from S2K
                var HookMgr = require('dw/system/HookMgr');
                
                if (HookMgr.hasHook('app.b2b.account.retrieve')) {
                    var accountDetails = HookMgr.callHook('app.b2b.account.retrieve',
                                                          'Handle',
                                                           accountNumber, 
                                                           zipCode);
                }
                // populate the response
                if(accountDetails.hasOwnProperty('accountNotFound') && accountDetails.accountNotFound){
                    res.json({
                        success: false,
                        errorMessage: Resource.msg('b2b.error.notfound', 'b2berrors', null) 
                    }); 
                }
                else
                {
                    if ((accountDetails == null) || (accountDetails != null && accountDetails.hasOwnProperty('error') && accountDetails.error)) {
                    res.json({
                        success: false,
                        errorMessage: Resource.msg('b2b.errors.account.retrieval', 'b2berrors', null) 
                    });
                    } else {
                        if (accountDetails.statusCode == 404) {
                            res.json({
                                success: false,
                                errorMessage: Resource.msg('b2b.errors.account.not.found', 'b2berrors', null) 
                            });
                        }
                        else {
                            res.json({
                                success: true,
                                accountDetails: accountDetails
                            });
                        }
                    }
                }
            }
        } else {
            throw new Error(Resource.msgf('s2k.errors.missingparameters', 's2kerrors', null, 'B2BLocateAccount'));
        }
    
        next();
    }
);

/**
 * Route to handle the B2B Registration in a different form
 */
server.get('B2BRegistration', function (req, res, next) {
    
    var b2bRegistrationForm = server.forms.getForm('b2buserregistration');

	b2bRegistrationForm.clear();
   // 7-2 render the newsletter signup form, passing in the form
	res.render('account/b2bUserRegistration', {
		b2bRegistrationForm: b2bRegistrationForm
	});

	next();
});

/**
 * Route to handle the B2B User Registration Submit Form
 * Account-B2BSubmitRegistration : The Account-SubmitRegistration endpoint is the endpoint that gets hit when a shopper submits their registration for a new account
 * @name Account-SubmitB2BRegistration
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {querystringparameter} - rurl - redirect url. The value of this is a number. This number then gets mapped to an endpoint set up in oAuthRenentryRedirectEndpoints.js
 * @param {httpparameter} - dwfrm_profile_customer_organizationName - Input field for the shoppers's organization name
 * @param {httpparameter} - dwfrm_profile_customer_firstname - Input field for the shoppers's first name
 * @param {httpparameter} - dwfrm_profile_customer_lastname - Input field for the shopper's last name
 * @param {httpparameter} - dwfrm_profile_customer_phone - Input field for the shopper's phone number
 * @param {httpparameter} - dwfrm_profile_customer_email - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_customer_emailconfirm - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_login_password - Input field for the shopper's password
 * @param {httpparameter} - dwfrm_profile_login_passwordconfirm: - Input field for the shopper's password to confirm
 * @param {httpparameter} - dwfrm_profile_customer_addtoemaillist - Checkbox for whether or not a shopper wants to be added to the mailing list
 * @param {httpparameter} - csrf_token - hidden input field CSRF token
 * @param {httpparameter} - registrationForm.b2bUser - hidden input field b2User flag
 * @param {httpparameter} - registrationForm.b2bAdmin - hidden input field b2bAdmin flag
 * @param {httpparameter} - registrationForm.b2bAdminApproved - hidden input field b2bAdminApproved flag
 * @param {httpparameter} - registrationForm.b2bWebEnabled - hidden input field b2bWebEnabled flag
 * @param {httpparameter} - registrationForm.b2bPayByTerms - hidden input field b2bPayByTerms flag
 * @param {httpparameter} - registrationForm.b2bPORequired - hidden input field b2bPORequired indicator
 * @param {httpparameter} - registrationForm.b2bAccountNumber - hidden input field b2bAccountNumber
 * @param {httpparameter} - registrationForm.b2bSalesPersonInfo - hidden input field b2bSalesPersonInfo JSON object
 * @param {httpparameter} - registrationForm.b2bBalanceDue - hidden input field b2bBalanceDue
 * @param {httpparameter} - registrationForm.b2bCreditLimit - hidden input field b2bCreditLimit
 * @param {returns} - json
 * @param {serverfunction} - post
 */
 server.post(
    'SubmitB2BRegistration',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Resource = require('dw/web/Resource');
        var formErrors = require('*/cartridge/scripts/formErrors');
        var registrationForm = server.forms.getForm('profile');


        /** Wishlist PrePend Management START */
        var viewData = res.getViewData();
        var list = productListHelper.getList(req.currentCustomer.raw, { type: 10 });
        viewData.list = list;
        res.setViewData(viewData);
        /** Wishlist PrePend Management END */

       if(isGoogleRecaptchaEnabled && !empty(googeReCaptchaKey))
        {
            if (request.getHttpParameterMap().get("g-recaptcha-response").value === undefined || 
                request.getHttpParameterMap().get("g-recaptcha-response").value === '' || 
                request.getHttpParameterMap().get("g-recaptcha-response").value === null) {
                // return error
                res.json({"success": false, "errorField" : "reCaptcha","message" : Resource.msg('g.recaptcha.error.message', 'forms', null)});
                return next();
            } else {
                var googleCaptchaResult = googleCaptchaUtil.validateToken(request.getHttpParameterMap().get("g-recaptcha-response").value);
                if (!googleCaptchaResult.success) {
                    res.json({"success": false, "errorField" : "reCaptcha","message" : Resource.msg('g.recaptcha.error.message', 'forms', null)});
                    return next();
                }
            }
        }
        if (registrationForm.login.password.value !== registrationForm.login.passwordconfirm.value ) {
            registrationForm.login.password.valid = false;
            registrationForm.login.passwordconfirm.valid = false;
            registrationForm.login.passwordconfirm.error = Resource.msg('error.message.mismatch.password', 'forms', null);
            registrationForm.valid = false;
        }

        if (!CustomerMgr.isAcceptablePassword(registrationForm.login.password.value)) {
            registrationForm.login.password.valid = false;
            registrationForm.login.passwordconfirm.valid = false;
            registrationForm.login.passwordconfirm.error = Resource.msg('error.message.password.constraints.not.matched', 'forms', null);
            registrationForm.valid = false;
        }

        // form validation
        if (!validationHelper.valdateEmailId(registrationForm.customer.email.value.toLowerCase())) {
            registrationForm.customer.email.valid = false;
            registrationForm.customer.email.error =
                Resource.msg('error.message.invalid.email', 'forms', null);
            registrationForm.valid = false;
        }        

        // setting variables for the BeforeComplete function
        var registrationFormObj = {
            organizationName: registrationForm.customer.organizationName.value,
            firstName: registrationForm.customer.firstname.value,
            lastName: registrationForm.customer.lastname.value,
            phone: registrationForm.customer.phone.value,
            email: registrationForm.customer.email.value,
            logonId: registrationForm.customer.logonId.value,
            interestedInACA: registrationForm.customer.interestedInACA.value,
            addToEmailList: registrationForm.customer.addtoemaillist.value,
            password: registrationForm.login.password.value,
            passwordConfirm: registrationForm.login.passwordconfirm.value,
            b2bUser: req.form.isB2BUser,
            b2bAdmin: req.form.isB2BAdmin,
            b2bAdminApproved: req.form.isB2BAdminApproved,
            b2bPORequired: req.form.isB2BPORequired,
            b2bWebEnabled: req.form.isB2BWebEnabled,
            b2bPayByTerms: req.form.isB2BPayByTerms,
            b2bAccountNumber: req.form.b2bAccountNumber,
            b2bSalesPersonInfo: req.form.b2bSalesPersonInfo,
            b2bCreditLimit: req.form.b2bCreditLimit,
            b2bBalanceDue: req.form.b2bBalanceDue,
            validForm: registrationForm.valid,
            form: registrationForm
        };

        // validate that the organization does not already exist
        if (b2bUtils.b2bOrganizationExists(registrationForm.customer.organizationName.value)) {
            registrationForm.valid = false;
            registrationForm.customer.organizationName.valid = false;
            registrationForm.customer.organizationName.error = Resource.msg('error.message.org.exists', 'forms', null);
        }

        if (registrationForm.valid) {
            res.setViewData(registrationFormObj);

            this.on ('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
                var Transaction = require('dw/system/Transaction');
                var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');
                var authenticatedCustomer;
                var serverError;

                // getting variables for the BeforeComplete function
                var registrationForm = res.getViewData(); // eslint-disable-line

                if (registrationForm.validForm) {
                    var login = registrationForm.logonId;
                    var password = registrationForm.password;

                    // attempt to create a new B2B user and log that user in.
                    try {
                        Transaction.wrap(function () {
                            var error = {};
                            var newCustomer = CustomerMgr.createCustomer(login, password);

                            var authenticateCustomerResult = CustomerMgr.authenticateCustomer(login, password);
                            if (authenticateCustomerResult.status !== 'AUTH_OK') {
                                error = { authError: true, status: authenticateCustomerResult.status };
                                throw error;
                            }

                            authenticatedCustomer = CustomerMgr.loginCustomer(authenticateCustomerResult, false);

                            if (!authenticatedCustomer) {
                                error = { authError: true, status: authenticateCustomerResult.status };
                                throw error;
                            } else {

                                // assign values to the profile
                                var newCustomerProfile = newCustomer.getProfile();
                                newCustomerProfile.firstName = registrationForm.firstName;
                                newCustomerProfile.lastName = registrationForm.lastName;
                                newCustomerProfile.phoneHome = registrationForm.phone;
                                newCustomerProfile.email = registrationForm.email;

                                // assign the B2B account specific values  
                                newCustomerProfile.custom.b2bUser = (registrationForm.b2bUser == "true");
                                newCustomerProfile.custom.b2bAdmin = (registrationForm.b2bAdmin == "true");
                                newCustomerProfile.custom.b2bAdminApproved = (registrationForm.b2bAdminApproved == "true");
                                newCustomerProfile.custom.b2bWebEnabled = (registrationForm.b2bWebEnabled == "true");
                                newCustomerProfile.custom.b2bPayByTerms = (registrationForm.b2bPayByTerms == "true");
                                
                                if(registrationForm.b2bPORequired == "Y") {
                                    newCustomerProfile.custom.b2bPORequired = true;    
                                } else {
                                    newCustomerProfile.custom.b2bPORequired = false;    
                                }
                                
                                newCustomerProfile.custom.b2bAccountNumber = registrationForm.b2bAccountNumber || "";
                                newCustomerProfile.custom.b2bSalesPersonInfo = JSON.stringify(registrationForm.b2bSalesPersonInfo);
                                newCustomerProfile.custom.b2bBalanceDue = parseInt(registrationForm.b2bBalanceDue);
                                newCustomerProfile.custom.b2bCreditLimit = parseInt(registrationForm.b2bCreditLimit);
                                newCustomerProfile.custom.b2bOrganizationName = registrationForm.organizationName;                            

                                // create the B2BOrganization custom object
                                var accountNumber = registrationForm.organizationName;
                                if ((registrationForm.b2bAccountNumber !== undefined) && (registrationForm.b2bAccountNumber !== null)) {
                                    accountNumber = registrationForm.b2bAccountNumber;
                                } 
                                b2bUtils.createB2BOrganization(registrationForm.organizationName, 
                                                               accountNumber, login);

                                // retrieve the sales person's detailed information 
                                if ((newCustomerProfile.custom.b2bUser) && 
                                    (newCustomerProfile.custom.b2bAccountNumber != null) && 
                                    (newCustomerProfile.custom.b2bAccountNumber != "") &&
                                    (newCustomerProfile.custom.b2bSalesPersonInfo != "")) {
                                    var HookMgr = require('dw/system/HookMgr');

                                    var salesPersonJSON = JSON.parse(registrationForm.b2bSalesPersonInfo);
                                    if (salesPersonJSON && HookMgr.hasHook('app.b2b.salesperson.retrieve')) {
                                        var salesPersonId = parseInt(salesPersonJSON.salesmanNo);
                                         // retrieve the sales person information
                                        var salesPersonDetails = HookMgr.callHook('app.b2b.salesperson.retrieve',
                                                                                  'Handle',
                                                                                  salesPersonId);
                                        if ((salesPersonDetails.success) && (salesPersonDetails.salesRep != null)) {
                                            // set the sales person details
                                            newCustomerProfile.custom.b2bSalesPersonInfo = JSON.stringify(salesPersonDetails.salesRep);
                                        }
                                    } 
                                }
                            }
                        });
                    } catch (e) {
                        if (e.authError) {
                            serverError = true;
                        } else {
                            registrationForm.validForm = false;
                            registrationForm.form.customer.logonId.valid = false;
                            registrationForm.form.customer.logonId.error = Resource.msg('error.message.username.invalid', 'forms', null);
                        }
                    }
                }

                delete registrationForm.password;
                delete registrationForm.passwordConfirm;
                formErrors.removeFormValues(registrationForm.form);

                if (serverError) {
                    res.setStatusCode(500);
                    res.json({
                        success: false,
                        errorMessage: Resource.msg('error.message.unable.to.create.account', 'login', null)
                    });

                    return;
                }

                if (registrationForm.validForm) {

                    //Send Newsletter Entry message now
                    messageHelper.handleNewsletterSignup(registrationForm.addToEmailList,request.geolocation.postalCode,registrationForm.email);

                    // send the registration email
                    accountHelpers.sendCreateAccountEmail(authenticatedCustomer.profile);

                    // send the B2B registered user email
                    b2bUtils.createSendB2BRegisteredUserEmail(registrationForm);

                    res.setViewData({ authenticatedCustomer: authenticatedCustomer });
                    res.json({
                        success: true,
                        redirectUrl: accountHelpers.getLoginRedirectURL(req.querystring.rurl, req.session.privacyCache, true)
                    });

                    req.session.privacyCache.set('args', null);

                    /**WishList Append Management START */
                    var viewData = res.getViewData();
                    var listGuest = viewData.list;
                    if (viewData.authenticatedCustomer) {
                        var listLoggedIn = productListHelper.getCurrentOrNewList(viewData.authenticatedCustomer, { type: 10 });
                        productListHelper.mergelists(listLoggedIn, listGuest, req, { type: 10 });
                    }
                    /**WishList Append Management END */    
                                        
                } else {
                    res.json({
                        fields: formErrors.getFormErrors(registrationForm)
                    });
                }
            });
        
        } else {
            res.json({
                fields: formErrors.getFormErrors(registrationForm)
            });
        }

        next();
    }
);

/**
 * Account-Login : The Account-Login endpoint will render the shopper's account page. Once a shopper logs in they will see is a dashboard that displays profile, address, payment and order information.
 * @name Base/Account-Login
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {querystringparameter} - rurl - redirect url. The value of this is a number. This number then gets mapped to an endpoint set up in oAuthRenentryRedirectEndpoints.js
 * @param {httpparameter} - loginEmail - The email associated with the shopper's account.
 * @param {httpparameter} - loginPassword - The shopper's password
 * @param {httpparameter} - loginRememberMe - Whether or not the customer has decided to utilize the remember me feature.
 * @param {httpparameter} - csrf_token - a CSRF token
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 *
 */
 server.append('Login', function (req, res, next) {
    var Resource = require('dw/web/Resource');
    var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');
    var Transaction = require('dw/system/Transaction');
    var HookMgr = require('dw/system/HookMgr');
    if (res.viewData.authenticatedCustomer) {
        res.setViewData({ authenticatedCustomer: res.viewData.authenticatedCustomer });

        // determine if it is a B2B user
        // if so, retrieve the account information from S2K and update the profile accordingly
        var authenticatedCustomer = res.viewData.authenticatedCustomer;
        if ((authenticatedCustomer != null) && (authenticatedCustomer.profile != null)) {
            var customerProfile = authenticatedCustomer.profile;
            if ((customerProfile.custom.b2bUser) && 
                (customerProfile.custom.b2bAccountNumber != null) && 
                (customerProfile.custom.b2bAccountNumber != "")) {
                // retrieve the account information from S2K
                var s2kAccountNumber = customerProfile.custom.b2bAccountNumber;
                if (HookMgr.hasHook('app.b2b.accountinfo.retrieve')) {
                    var accountInformation = HookMgr.callHook('app.b2b.accountinfo.retrieve',
                                                                'Handle',
                                                                s2kAccountNumber, 
                                                                "");
                    if ((accountInformation != null) && (accountInformation.success) && (accountInformation.billto != null)) {
                        var salesPersonId = accountInformation.billto.salesmanNo;
                        if ((salesPersonId != null) && (salesPersonId != "")) {
                            // retrieve the sales person information
                            var salesPersonDetails = HookMgr.callHook('app.b2b.salesperson.retrieve',
                                                                        'Handle',
                                                                        salesPersonId);
                        }
                        try {
                            Transaction.wrap(function () {
                                // set the details received from S2K
                                customerProfile.custom.b2bWebEnabled = accountInformation.billto.webEnabled;
                                customerProfile.custom.b2bPayByTerms = accountInformation.billto.payByTerms;
                                
                                if(accountInformation.billto.poRequired == "Y") {
                                    customerProfile.custom.b2bPORequired = true;
                                } else {
                                    customerProfile.custom.b2bPORequired = false;
                                }

                                customerProfile.custom.b2bBalanceDue = accountInformation.billto.balanceDue;
                                customerProfile.custom.b2bCreditLimit = accountInformation.billto.creditLimit;
                                if ((salesPersonDetails.success) && (salesPersonDetails.salesRep != null)) {
                                    customerProfile.custom.b2bSalesPersonInfo = JSON.stringify(salesPersonDetails.salesRep);
                                }

                                //Now sync the account address into this profile
                                b2bUtils.syncAccountShipToAddress(accountInformation.shiptoList)
                            });
                        } catch (e) {
                            var a =e;
                            // log the exception
                            s2kLogger.error(Resource.msgf('b2b.errors.accountinfo.retrieval', 'b2berrors', null, s2kAccountNumber));
                        }
                    } 
                }
            }
        }
        var mergeCart = HookMgr.callHook('dw.order.merge.cart.on.login','mergeCartOnLogin');
        res.json({
            success: true,
            redirectUrl: accountHelpers.getLoginRedirectURL(req.querystring.rurl, req.session.privacyCache, false)
        });

        req.session.privacyCache.set('args', null);
    } else {
        res.json({ error: [Resource.msg('error.message.login.form', 'login', null)] });
    }

    return next();
});


/**
 * Account-B2BAccountManagerHeader : The Account-Header endpoint is used as a remote include to include the login/b2bAccountManagerHeader in the header
 * @name Account-B2BAccountManagerHeader
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.include
 * @param {querystringparameter} - mobile - a flag determining whether or not the shopper is on a mobile sized screen this determines what isml template to render
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
 server.get(
    'B2BAccountManagerHeader', 
    server.middleware.include, 
    function (req, res, next) {
        var accountManagerId;
        var accountManagerName;
        var contactAccountManagerModalID = req.querystring.contactAccountManagerModalID; 
        if (!req.querystring.mobile) {
            var customer = req.currentCustomer.raw;
            // check if it is a B2B user,
            // if so, set the Account Manager information
            if (customer.registered && customer.profile && customer.profile.custom && customer.profile.custom.b2bUser && customer.profile.custom.b2bSalesPersonInfo) {
                var salesPersonDetails = JSON.parse(customer.profile.custom.b2bSalesPersonInfo);
                if ((salesPersonDetails.id) && (salesPersonDetails.name)) {
                    accountManagerId = salesPersonDetails.id;
                    accountManagerName = salesPersonDetails.name;
                    
                }
            }
        }
        var template = 'account/b2bAccountManagerHeader';
        res.render(template, { accountManagerId: accountManagerId,
                                accountManagerName: accountManagerName, contactAccountManagerModalID:contactAccountManagerModalID
        });
        next(); 
    }
);

/**
 * Account-ContactAccountManagerDialogForm : The Account-ContactAccountManagerDialogForm endpoint gets exeuted once the shopper has clicked Contact Account Manager link in the header and has submitted the message to be sent to the Account Manager
 * @name Account-ContactAccountManagerDialogForm
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {form} - the form object containing the message to be sent to the account manager 
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 */
 server.post('ContactAccountManagerDialogForm', server.middleware.https, function (req, res, next) {
    var Resource = require('dw/web/Resource');

    var messageContent = req.form.messageContent;
    var errorMsg;
    var buttonText = Resource.msg('accountmanager.contact.button.close', 'b2bUserRegistration', null);
    var confirmationMessage = Resource.msg('accountmanager.contact.confirmation.message', 'b2bUserRegistration', null);

    if (messageContent) {
        var customer = req.currentCustomer.raw;
        if (customer.registered && customer.profile && customer.profile.custom && customer.profile.custom.b2bUser && customer.profile.custom.b2bSalesPersonInfo) {
            var salesPersonDetails = JSON.parse(customer.profile.custom.b2bSalesPersonInfo);
            if ((salesPersonDetails.id) && (salesPersonDetails.name)) {
                var accountManagerId = salesPersonDetails.id;
                var accountManagerName = salesPersonDetails.name;
                var accountManagerEmailAddress = salesPersonDetails.emailAddress;
            }

            var contactAccountManagerForm = {
                accountManagerId : accountManagerId,
                accountManagerName : accountManagerName,
                customerFirstName : customer.profile.firstName,
                customerLastName : customer.profile.lastName,
                customerPhoneNumber : customer.profile.phoneHome,
                customerEmailAddress : customer.profile.email,
                customerOrganizationName : customer.profile.custom.b2bOrganizationName,
                accountManagerEmailAddress : accountManagerEmailAddress,
                message : messageContent
            }

            // send the B2B contact account manager email
            b2bUtils.createSendB2BContactAccountManagerEmail(contactAccountManagerForm);

            res.json({
                success: true,
                buttonText: buttonText,
                confirmationMessage : confirmationMessage,
            });
        } else {
            // display the message could not be sent error
            errorMsg = Resource.msg('accountmanager.contact.error.message.not.sent', 'b2bUserRegistration', null);
            res.json({
                fields: {
                    messageContent: errorMsg
                }
            });
        }   
    } else {
        // display the message required error
        errorMsg = Resource.msg('accountmanager.contact.error.message.required', 'b2bUserRegistration', null);
        res.json({
            fields: {
                messageContent: errorMsg
            }
        });
    }
    
    next();
});

/**
 * Account-Show : The Account-Show endpoint will render the shopper's account page. Once a shopper logs in they will see is a dashboard that displays profile, address, payment and order information. For B2B Admin user, the Manage Buyer(s) information will be displayed.
 * @name Account-Show
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - userLoggedIn.validateLoggedIn
 * @param {middleware} - consentTracking.consent
 * @param {querystringparameter} - registration - A flag determining whether or not this is a newly registered account
 * @param {category} - senstive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
 server.append('Show', function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    res.setViewData({
        viewBuyerListUrl: URLUtils.url('B2BBuyer-List').toString(),
        addBuyerUrl: URLUtils.url('B2BBuyer-AddBuyer').toString()
    });
    var breadcrumbs= [
        {
            htmlValue: Resource.msg('global.home', 'common', null),
            url: URLUtils.home().toString()
        },
        {
            htmlValue: Resource.msg('page.title.myaccount', 'account', null),
            url: URLUtils.url('Account-Show').toString()
        }
    ];
    var computedMetaData = {
        title: Resource.msg('account.page.title', 'account', null), 
        description: Resource.msg('account.page.description', 'account', null),
        keywords: Resource.msg('account.page.keywords', 'account', null),
        pageMetaTags: []
};
    var pageGroup = {name: Resource.msg('account.page.pageGroup.name', 'account', null),
                        ID: Resource.msg('account.page.pageGroup.name', 'account', null),
                        content: Resource.msg('account.page.pageGroup.value', 'account', null)};
    var robots = {name: Resource.msg('account.page.robots.name', 'account', null),
                    ID: Resource.msg('account.page.robots.name', 'account', null),
                    content: Resource.msg('account.page.robots.value', 'account', null)};                    
    computedMetaData.pageMetaTags.push(pageGroup);
    computedMetaData.pageMetaTags.push(robots);

    res.setViewData({
        breadcrumbs: breadcrumbs,
        CurrentPageMetaData: computedMetaData
    });
    next();
});

/**
 * Account-SaveNewPassword : The Account-SaveNewPassword endpoint handles resetting a shoppers password. This is the last step in the forgot password user flow. (This step does not log the shopper in.)
 * @name Base/Account-SaveNewPassword
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {querystringparameter} - Token - SFRA utilizes this token to retrieve the shopper
 * @param {httpparameter} - dwfrm_newPasswords_newpassword - Input field for the shopper's new password
 * @param {httpparameter} - dwfrm_newPasswords_newpasswordconfirm  - Input field to confirm the shopper's new password
 * @param {httpparameter} - save - unutilized param
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - post
 */
 server.replace('SaveNewPassword', csrfProtection.validateAjaxRequest, server.middleware.https, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var Resource = require('dw/web/Resource');
    var CustomerMgr = require('dw/customer/CustomerMgr');
    
    var passwordForm = server.forms.getForm('newPasswords');
    var token = req.querystring.Token;

    if (passwordForm.newpassword.value !== passwordForm.newpasswordconfirm.value) {
        passwordForm.valid = false;
        passwordForm.newpassword.valid = false;
        passwordForm.newpasswordconfirm.valid = false;
        passwordForm.newpasswordconfirm.error =
            Resource.msg('error.message.mismatch.newpassword', 'forms', null);
    }

    if (passwordForm.valid && !CustomerMgr.isAcceptablePassword(passwordForm.newpassword.value)) {
        passwordForm.newpassword.valid = false;
        passwordForm.newpassword.error =
            Resource.msg('error.message.password.constraints.not.matched', 'forms', null);                
            passwordForm.valid = false;
    }

    if (passwordForm.valid) {
        var result = {
            newPassword: passwordForm.newpassword.value,
            newPasswordConfirm: passwordForm.newpasswordconfirm.value,
            token: token,
            passwordForm: passwordForm
        };
        res.setViewData(result);
        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var CustomerMgr = require('dw/customer/CustomerMgr');
            var URLUtils = require('dw/web/URLUtils');
            var Site = require('dw/system/Site');
            var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');

            var formInfo = res.getViewData();
            var status;
            var resettingCustomer;
            Transaction.wrap(function () {
                resettingCustomer = CustomerMgr.getCustomerByToken(formInfo.token);
                status = resettingCustomer.profile.credentials.setPasswordWithToken(
                    formInfo.token,
                    formInfo.newPassword
                );
            });
            if (status.error) {
                passwordForm.newpassword.valid = false;
                passwordForm.newpasswordconfirm.valid = false;
                passwordForm.newpasswordconfirm.error =
                    Resource.msg('error.message.resetpassword.invalidformentry', 'forms', null);
                res.render('account/password/newPassword', {
                    passwordForm: passwordForm,
                    token: token
                });
            } else {
                var email = resettingCustomer.profile.email;
                var url = URLUtils.https('Login-Show');
                var objectForEmail = {
                    firstName: resettingCustomer.profile.firstName,
                    lastName: resettingCustomer.profile.lastName,
                    url: url
                };

                var emailObj = {
                    to: email,
                    subject: Resource.msg('subject.profile.resetpassword.email.new', 'login', null),
                    from: Site.current.getCustomPreferenceValue('customerServiceEmail') || 'no-reply@testorganization.com',
                    type: emailHelpers.emailTypes.passwordReset
                };

                emailHelpers.sendEmail(emailObj, 'account/password/passwordChangedEmail', objectForEmail);
                res.redirect(URLUtils.url('Login-Show'));
            }
        });
    } else {
        res.render('account/password/newPassword', { passwordForm: passwordForm, token: token });
    }
    next();
});

/**
 * Account-Header : The Account-Header endpoint is used as a remote include to include the login/account menu in the header
 * @name Base/Account-Header
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.include
 * @param {querystringparameter} - mobile - a flag determining whether or not the shopper is on a mobile sized screen this determines what isml template to render
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
 server.replace('Header', server.middleware.include, function (req, res, next) {
    var template = req.querystring.mobile ? 'account/mobileHeader' : 'account/header';
    res.render(template, { name:
        req.currentCustomer.profile ? req.currentCustomer.profile.firstName : null
    });
    next();
});

module.exports = server.exports();
