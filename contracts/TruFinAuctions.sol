// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Uncomment this line to use console.log
import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

error AuctionTooShort();
error BiddingPeriodOver();
error AuctionFinalised();
error AuctionNotFinished();
error InsufficientBid();
error UnsuccessfulReturn();
error QuantityMustBeNonZero();

interface IERC20 {
    function transferFrom(address from, address to, uint256 quantity) external;
    function transfer(address to, uint256 quantity) external;

}

/// @title  TruFin Auction Tech Test
/// @author Emilio Lanzalaco
/// @notice I am assuming "items" from description are ERC20 tokens

/// @dev    I have made the contract upgradeable to be able to change the implementation whilst preserving state of current auctions. 
///         For example, introducing new ERC721 auctions. 
///         I could have made it Pausable in case of exploits but with the Reentrancy Guard there is no need.
///         I went for an auction system that cannot be cancelled once created. There is the possiblity of using a reserve price. 
///         I created various events for easy UI / back-end implementation.

contract TruFinAuctions is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    
    /// @dev Representing an auction in storage.
    /// @param seller The address selling the ERC20 tokens.
    /// @param endTime The unix timestamp after which no more bids can be placed.
    /// @param highestBid The value of the highest bid received so far, or the reserve price if it has not yet been met.
    /// @param highestBidder The address of the current highest bidder.
    struct Auction {
        address seller;
        uint96 quantity;
        address tokenContract;
        uint88 endTime;
        bool isFinalised;
        address highestBidder;
        uint96 highestBid;
    }

    /// @notice Emitted when an auction is created.
    /// @param auctionId Unique id
    /// @param tokenContract Contract address for token being auctioned.
    /// @param quantity Number of tokens being auctioned.
    event AuctionCreated (
        uint256 auctionId,
        address tokenContract,
        uint96 quantity
    );

    /// @notice Emitted when an auction is finished.
    /// @param auctionId Unique id
    /// @param status True for success, false for failed auction.
    /// @param winner Address of winning bidder.
    /// @dev You could also add in winning quantity and token address.
    event AuctionFinished (
        uint256 auctionId,
        bool status,
        address winner
    );

    /// @notice Emitted when a new highest bid is made.
    /// @param auctionId Unique id
    /// @param highestBid The value of the highest bid received so far, or the reserve price if it has not yet been met.
    /// @param highestBidder The address of the current highest bidder.
    /// @dev You could also add in winning quantity and token address.
    event HighestBidMade (
        uint256 auctionId,
        uint96 highestBid,
        address highestBidder
    );

    /// @notice Mapping the auctions with a simple counter.
    mapping (uint256 => Auction) public auctions;

    /// @notice The minimum amount of ether that someone can outbid the highest bidder.
    uint96 public minBidIncrement;

    /// @notice Storing a counter to increment auctionIds.
    uint160 public nextAuctionId;

    /// @notice Constructor that initialises state for proxy contract.
    function initialize() initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        minBidIncrement = 10000000 gwei;
        nextAuctionId = 1;
    }

    /// @notice Ugrades proxy contract to new implementation.
    /// @param implementation The address of new implementation contract.  
    function _authorizeUpgrade(address implementation) internal override onlyOwner {}

    /// @notice Creates an auction with given input params.
    /// @param tokenContract The address of the ERC20 token being auctioned.
    /// @param quantity The quantity of ERC20 tokens being auctioned.
    /// @param auctionLength The length of time - in seconds - of the proposed auction.
    /// @param reservePrice The minimum price that someone has to bid.
    function createAuction (
        address tokenContract, 
        uint96 quantity, 
        uint88 auctionLength, 
        uint96 reservePrice
    ) 
        external nonReentrant() /// prevents bogus token causing reentering, although nothing to be gained for attacker.
    {   
        // more gas efficient at deploy than require()
        if (auctionLength < 1 hours) revert AuctionTooShort();
        if (quantity == 0) revert QuantityMustBeNonZero();

        Auction storage auction = auctions[uint256(nextAuctionId)];

        auction.seller = msg.sender;
        auction.quantity = quantity;
        auction.tokenContract = tokenContract;
        auction.endTime = uint88(block.timestamp) + auctionLength;
        auction.highestBid = reservePrice;

        IERC20(tokenContract).transferFrom(msg.sender, address(this), quantity);

        emit AuctionCreated(
            nextAuctionId,
            tokenContract, 
            quantity
        );
        
        nextAuctionId++; 

    }


    /// @notice Bids on a particular auction.
    /// @param auctionId The unique auction identifier.
    function bid (
        uint256 auctionId 
    )
        external payable /// @dev no need for reentrancy protection
    {
        Auction storage auction = auctions[auctionId];
        
        // I would prevent msg.sender being auction.seller but you cant prevent manipulation through a sybil identity from another EOA
        
        if (block.timestamp > auction.endTime ) revert BiddingPeriodOver();

        // making sure someone can bid reserve price
        uint96 minBid = auction.highestBidder == address(0) ? auction.highestBid : auction.highestBid + minBidIncrement;
        if (uint96(msg.value) < minBid) revert InsufficientBid();

        // returning funds, making sure that funds are successfully sent
        if (auction.highestBidder != address(0)) {
            (bool sent,) = payable(auction.highestBidder).call{value: auction.highestBid}("");
            if (!sent) revert UnsuccessfulReturn();
        }
        
        auction.highestBid = uint96(msg.value);
        auction.highestBidder = msg.sender;

        emit HighestBidMade(
            auctionId, 
            auction.highestBid, 
            auction.highestBidder
        );

    } 


    /// @notice Finalises the auction and distributes/returns rewards.
    /// @param auctionId Unique identifier for the auction to be ended.
    /// @dev I have put no restriction on who can call this as there is no need to.
    function finishAuction (
        uint256 auctionId
    ) 
        external /// @dev no need for reentrancy protection as auction.isFinalised does the same job
    {
        Auction storage auction = auctions[auctionId];
        if (block.timestamp < auction.endTime) revert AuctionNotFinished();
        
        if (auction.isFinalised) revert AuctionFinalised(); 
        auction.isFinalised = true;

        bool success;

        // successful auction sending ether to seller and tokens to buyer
        if (auction.highestBidder != address(0)) {
            (bool sent,) = payable(auction.seller).call{value: auction.highestBid}("");
            if (!sent) revert UnsuccessfulReturn();
            IERC20(auction.tokenContract).transfer(auction.highestBidder, auction.quantity);
            success = true;
        }
        // if reserve price not met return tokens to seller
        else {
            IERC20(auction.tokenContract).transfer(auction.seller, auction.quantity);
        }

        emit AuctionFinished(
            auctionId,
            success,
            auction.highestBidder
        );
    }

}

contract TruFinAuctionsV2 is TruFinAuctions {
    function getVersion() external pure returns (string memory) {
        return "v2";
    }
}