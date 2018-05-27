module.exports = {
    summary: 'my test module',
    * beforeSendRequest(requestDetail) {
        return true;
    },
    * beforeSendResponse(requestDetail, responseDetail) {
        return true;
    },
    * beforeDealHttpsRequest(requestDetail) {
        return true;
    },
};