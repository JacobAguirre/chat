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
        /*
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
        */
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


                                    if(HookMgr.hasHook('app.b2b.create.account')){
                                        console.log("hook found");
                                        var testVar = HookMgr.callHook('app.b2b.create.account',
                                                                       'createAccount',
                                                                       registrationForm.organizationName,
                                                                       registrationForm.phone);
                                    }

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
