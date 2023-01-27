import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";


describe("TruFinAuctions", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployTruFinAuctions() {
    
    const [owner, acc1, acc2, acc3] = await ethers.getSigners();

    const Auctions = await ethers.getContractFactory("TruFinAuctions");
    const auctions = await upgrades.deployProxy(Auctions, {kind: "uups"});

    const Token = await ethers.getContractFactory("TruFinToken");
    const token = await Token.deploy([owner.address, acc1.address, acc2.address])

    return { auctions, token, owner, acc1, acc2, acc3 };
  }

  describe("Deployment", function () {

    it("Should set the right owner", async function () {
      const { auctions, owner } = await loadFixture(deployTruFinAuctions);

      expect(await auctions.owner()).to.equal(owner.address);
    });

    it("Should set the right minimum bid increment", async function () {
      const { auctions, owner } = await loadFixture(deployTruFinAuctions);

      expect(await auctions.minBidIncrement()).to.equal(ethers.utils.parseEther("0.01"));
    });

    it("Should set next auction id to 1", async function () {
      const { auctions } = await loadFixture(deployTruFinAuctions);

      expect(await auctions.nextAuctionId()).to.equal(1)
    });
    it("Deploys dummy token and mints to accounts", async function () {
      const { token, owner, acc1, acc2 } = await loadFixture(deployTruFinAuctions);

      expect(await token.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("1000"))
      expect(await token.balanceOf(acc1.address)).to.equal(ethers.utils.parseEther("1000"))
      expect(await token.balanceOf(acc2.address)).to.equal(ethers.utils.parseEther("1000"))
    });
  });

  describe("ERC20 Auctions", function () {
    describe("Creating an auction", function () {
      it("Should create an auction with correct parameters", async function () {
        const { auctions, token, acc1 } = await loadFixture(deployTruFinAuctions);
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, 0)).to.not.be.reverted
        
        const auction = await auctions.auctions(1)
        expect(auction.seller).to.equal(acc1.address)
        expect(auction.tokenContract).to.equal(token.address)
        expect(auction.quantity).to.equal(ethers.utils.parseEther("1000"))
        expect(auction.endTime).to.equal(await time.latest() + 86400)
        expect(auction.seller).to.equal(acc1.address)
        expect(auction.highestBidder).to.equal("0x0000000000000000000000000000000000000000")
        expect(auction.highestBid).to.equal(0)
        expect(await token.balanceOf(auctions.address)).to.equal(ethers.utils.parseEther("1000"))
      
      });

      it("Reverts if auction length too short", async function () {
        const { auctions, token, acc1 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 10, 0)).to.be.revertedWithCustomError(auctions, "AuctionTooShort")
      });

      it("Reverts if token quantity is zero", async function () {
        const { auctions, token, acc1 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, 0, 86400, 0)).to.be.revertedWithCustomError(auctions, "QuantityMustBeNonZero")
      });

      it("Increases next auction id", async function () {
        const { auctions, token, acc1 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, 100, 86400, 0)).to.not.be.reverted
        expect(await auctions.nextAuctionId()).to.equal(2)
      });
    });

    describe("Bidding on auctions", () => {
  
      it("Let someone bid above reserve", async function () {
        const { auctions, token, acc1, acc2 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, 0)).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("0.1")})).to.not.be.reverted
        const auction = await auctions.auctions(1)
        expect(auction.highestBid).to.equal(ethers.utils.parseEther("0.1"))
      })

      it("Doesn't let someone bid below reserve", async function () {
        const { auctions, token, acc1, acc2 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("0.05")})).to.be.revertedWithCustomError(auctions, "InsufficientBid")
      })

      it("Doesn't let someone bid below highest bid", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("0.1")})).to.not.be.reverted
        await expect(auctions.connect(acc3).bid(1, {value: ethers.utils.parseEther("0.09")})).to.be.revertedWithCustomError(auctions, "InsufficientBid")

      })


      it("Doesn't let someone bid below minimum increment", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("0.1")})).to.not.be.reverted
        await expect(auctions.connect(acc3).bid(1, {value: ethers.utils.parseEther("0.101")})).to.be.revertedWithCustomError(auctions, "InsufficientBid")

      })
      it("Lets someone bid exact minimum increment", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("0.1")})).to.not.be.reverted
        await expect(auctions.connect(acc3).bid(1, {value: ethers.utils.parseEther("0.11")})).to.not.be.reverted

      })


      it("Doesn't let someone bid after end of auction", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("0.1")})).to.not.be.reverted
        await time.increase(86500)
        
        await expect(auctions.connect(acc3).bid(1, {value: ethers.utils.parseEther("0.15")})).to.be.revertedWithCustomError(auctions, "BiddingPeriodOver")

      })

      it("Takes ether from bidder", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("1")})).to.not.be.reverted
        await expect(await acc2.getBalance()).to.be.greaterThan(ethers.utils.parseEther("9998.9")).and.below(ethers.utils.parseEther("9999"))

      })

      it("Returns ether to old highest bidder", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("1000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("1")})).to.not.be.reverted
        await expect(auctions.connect(acc3).bid(1, {value: ethers.utils.parseEther("1.1")})).to.not.be.reverted
        await expect(await acc2.getBalance()).to.be.greaterThan(ethers.utils.parseEther("9999.9"))
        await expect(await acc3.getBalance()).to.be.greaterThan(ethers.utils.parseEther("9998.8")).and.below(ethers.utils.parseEther("9998.9"))

      })
    })

    describe ("Finishing auctions", () => {
      it("Finishes a successful auction and sends ether to seller, tokens to buyer ", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("10000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("1")})).to.not.be.reverted
        await time.increase(86500)

        await expect(auctions.finishAuction(1)).to.not.be.reverted
        await expect(await acc1.getBalance()).to.be.greaterThan(ethers.utils.parseEther("10000"))
        await expect(await token.balanceOf(acc2.address)).to.equal(ethers.utils.parseEther("2000"))
        await expect(await token.balanceOf(auctions.address)).to.equal(ethers.utils.parseEther("0"))

      })

      it("Finishes a failed auction and returns tokens to seller ", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("10000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await time.increase(86500)

        await expect(auctions.finishAuction(1)).to.not.be.reverted
        await expect(await token.balanceOf(acc1.address)).to.equal(ethers.utils.parseEther("1000"))
        await expect(await token.balanceOf(auctions.address)).to.equal(ethers.utils.parseEther("0"))

      })

      it("Doesn't let someone finish same auction twice", async function () {
        const { auctions, token, acc1, acc2, acc3 } = await loadFixture(deployTruFinAuctions);
        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("10000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("1")})).to.not.be.reverted

        await time.increase(86500)

        await expect(auctions.finishAuction(1)).to.not.be.reverted
        await expect(auctions.finishAuction(1)).to.be.revertedWithCustomError(auctions, "AuctionFinalised")


      })
    })

    describe("Events", function () {
      

      it("Should emit an event on auction creation", async function () {
        const { auctions, acc1, token } = await loadFixture(
          deployTruFinAuctions
        );

        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("10000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1")))
          .to.emit(auctions, "AuctionCreated").withArgs(1, token.address, ethers.utils.parseEther("1000"))
        
      });

      it("Should emit an event on highest bid", async function () {
        const { auctions, acc1, acc2, token } = await loadFixture(
          deployTruFinAuctions
        );

        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("10000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1")))
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("1")}))
        .to.emit(auctions, "HighestBidMade").withArgs(1, ethers.utils.parseEther("1"), acc2.address)
        
      });

      it("Should emit an event on successful auction finalisation", async function () {
        const { auctions, acc1, acc2, token } = await loadFixture(
          deployTruFinAuctions
        );

        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("10000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1")))
        await expect(auctions.connect(acc2).bid(1, {value: ethers.utils.parseEther("1")})).to.not.be.reverted
        await time.increase(86500)

        await expect(auctions.finishAuction(1)).to.emit(auctions, "AuctionFinished").withArgs(1, true, acc2.address)

      });

      it("Should emit an event on failed auction finalisation", async function () {
        const { auctions, acc1, token } = await loadFixture(
          deployTruFinAuctions
        );

        await expect(token.connect(acc1).approve(auctions.address, ethers.utils.parseEther("10000"))).to.not.be.reverted
        await expect(auctions.connect(acc1).createAuction(token.address, ethers.utils.parseEther("1000"), 86400, ethers.utils.parseEther("0.1"))).to.not.be.reverted
        await time.increase(86500)

        await expect(auctions.finishAuction(1)).to.emit(auctions, "AuctionFinished").withArgs(1, false, "0x0000000000000000000000000000000000000000")
      });
    });

    describe("Upgrades", function () {
      it("Should upgrade to a new implementation", async function () {
        const { auctions, owner} = await loadFixture(deployTruFinAuctions);

        const AuctionsV2 = await ethers.getContractFactory("TruFinAuctionsV2")
        const auctionsv2 = await upgrades.upgradeProxy(auctions.address, AuctionsV2)
        
        await expect(await auctionsv2.getVersion()).to.be.equal("v2")
      });
    });
  });
});
